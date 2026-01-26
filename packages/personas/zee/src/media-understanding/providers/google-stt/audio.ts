import { GoogleAuth } from "google-auth-library";
import type { AudioTranscriptionRequest, AudioTranscriptionResult } from "../../types.js";
import { fetchWithTimeout, readErrorResponse } from "../shared.js";

export const DEFAULT_GOOGLE_STT_REGION = "us-central1";
export const DEFAULT_GOOGLE_STT_MODEL = "chirp_2";

// Supported regions for Chirp 2
const CHIRP2_REGIONS = ["us-central1", "europe-west4", "asia-southeast1"] as const;

function resolveModel(model?: string): string {
  const trimmed = model?.trim();
  if (!trimmed) return DEFAULT_GOOGLE_STT_MODEL;
  // Normalize model names
  if (trimmed === "chirp" || trimmed === "chirp_2" || trimmed === "chirp-2") {
    return "chirp_2";
  }
  return trimmed;
}

function resolveRegion(baseUrl?: string): string {
  // Try to extract region from baseUrl if provided
  if (baseUrl) {
    for (const region of CHIRP2_REGIONS) {
      if (baseUrl.includes(region)) return region;
    }
  }
  return DEFAULT_GOOGLE_STT_REGION;
}

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) {
    throw new Error("Failed to obtain Google Cloud access token. Ensure ADC is configured.");
  }
  return token.token;
}

async function getProjectId(): Promise<string> {
  // Try environment variables first
  const envProjectId =
    process.env["GOOGLE_CLOUD_PROJECT"] ??
    process.env["GCLOUD_PROJECT"] ??
    process.env["GCP_PROJECT"];
  if (envProjectId) return envProjectId;

  // Try GoogleAuth
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const projectId = await auth.getProjectId();
  if (projectId) return projectId;

  throw new Error(
    "Google Cloud project ID not found. Set GOOGLE_CLOUD_PROJECT or configure ADC with a project."
  );
}

type Chirp2Response = {
  results?: Array<{
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
    }>;
  }>;
};

export async function transcribeGoogleSttAudio(
  params: AudioTranscriptionRequest
): Promise<AudioTranscriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const model = resolveModel(params.model);
  const region = resolveRegion(params.baseUrl);

  // Get project ID and access token
  const projectId = await getProjectId();
  const accessToken = await getAccessToken();

  // Build V2 API URL
  // Format: https://{region}-speech.googleapis.com/v2/projects/{project}/locations/{region}/recognizers/_:recognize
  const url = `https://${region}-speech.googleapis.com/v2/projects/${projectId}/locations/${region}/recognizers/_:recognize`;

  const headers = new Headers(params.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  // Determine encoding from mime type
  let encoding = "LINEAR16";
  let sampleRateHertz = 16000;

  if (params.mime) {
    const mime = params.mime.toLowerCase();
    if (mime.includes("flac")) {
      encoding = "FLAC";
    } else if (mime.includes("ogg") || mime.includes("opus")) {
      encoding = "OGG_OPUS";
    } else if (mime.includes("mp3") || mime.includes("mpeg")) {
      encoding = "MP3";
    } else if (mime.includes("webm")) {
      encoding = "WEBM_OPUS";
    }
  }

  // V2 API request body
  const body = {
    config: {
      model,
      languageCodes: params.language?.trim() ? [params.language.trim()] : ["en-US"],
      features: {
        enableAutomaticPunctuation: true,
      },
      explicitDecodingConfig: {
        encoding,
        sampleRateHertz,
        audioChannelCount: 1,
      },
    },
    content: params.buffer.toString("base64"),
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, params.timeoutMs, fetchFn);

  if (!res.ok) {
    const detail = await readErrorResponse(res);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Google STT transcription failed (HTTP ${res.status})${suffix}`);
  }

  const payload = (await res.json()) as Chirp2Response;
  const transcript = payload.results
    ?.flatMap((r) => r.alternatives ?? [])
    .map((a) => a.transcript?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!transcript) {
    throw new Error("Google STT transcription response missing transcript");
  }

  return { text: transcript, model };
}

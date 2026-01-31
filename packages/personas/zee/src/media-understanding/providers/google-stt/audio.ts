import fs from "node:fs/promises";

import { GoogleAuth } from "google-auth-library";

import type { AudioTranscriptionRequest, AudioTranscriptionResult } from "../../types.js";
import { fetchWithTimeout, normalizeBaseUrl, readErrorResponse } from "../shared.js";

export const DEFAULT_GOOGLE_STT_BASE_URL = "https://speech.googleapis.com/v1";
const DEFAULT_REGION = "us-central1";
const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_MODEL = "chirp_2";

type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
};

type ProviderQuery = Record<string, string | number | boolean>;

function normalizeModel(model?: string): string {
  const trimmed = model?.trim();
  if (!trimmed) return DEFAULT_MODEL;
  const lower = trimmed.toLowerCase();
  if (lower === "chirp2" || lower === "chirp-2") return "chirp_2";
  return trimmed;
}


async function readFileIfExists(pathname: string): Promise<string | null> {
  try {
    const stat = await fs.stat(pathname);
    if (!stat.isFile()) return null;
    return await fs.readFile(pathname, "utf8");
  } catch {
    return null;
  }
}

function parseServiceAccountKey(value: string): GoogleServiceAccountCredentials | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const clientEmail = parsed["client_email"];
    const privateKey = parsed["private_key"];
    if (typeof clientEmail !== "string" || !clientEmail.trim()) return null;
    if (typeof privateKey !== "string" || !privateKey.trim()) return null;
    const privateKeyId = parsed["private_key_id"];
    const projectId = parsed["project_id"];
    return {
      client_email: clientEmail,
      private_key: privateKey,
      ...(typeof privateKeyId === "string" && privateKeyId.trim()
        ? { private_key_id: privateKeyId }
        : {}),
      ...(typeof projectId === "string" && projectId.trim() ? { project_id: projectId } : {}),
    };
  } catch {
    return null;
  }
}

async function resolveCredentials(
  apiKey: string,
): Promise<{ apiKey?: string; credentials?: GoogleServiceAccountCredentials }> {
  const trimmed = apiKey.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    const parsed = parseServiceAccountKey(trimmed);
    if (parsed) return { credentials: parsed };
    return { apiKey: trimmed };
  }
  const fileContent = await readFileIfExists(trimmed);
  if (fileContent) {
    const parsed = parseServiceAccountKey(fileContent);
    if (parsed) return { credentials: parsed };
    return { apiKey: trimmed };
  }
  return { apiKey: trimmed };
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


function resolveRegion(query?: ProviderQuery): string {
  return coerceString(query?.region) ?? DEFAULT_REGION;
}

function resolveLanguage(params: { language?: string; query?: ProviderQuery }): string {
  const fromQuery = coerceString(params.query?.language);
  return params.language?.trim() || fromQuery || DEFAULT_LANGUAGE;
}

function resolveAlternativeLanguages(query?: ProviderQuery): string[] | undefined {
  const raw = coerceString(query?.alternativeLanguages ?? query?.alternative_language_codes);
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

async function getGoogleAccessToken(
  credentials?: GoogleServiceAccountCredentials,
): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials ? { credentials } : {}),
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (token?.token) return token.token;
  throw new Error(
    "Unable to obtain Google access token. Provide a service account key or set GOOGLE_APPLICATION_CREDENTIALS.",
  );
}

async function getGoogleProjectId(
  credentials?: GoogleServiceAccountCredentials,
): Promise<string | undefined> {
  const envProjectId =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT;
  if (envProjectId?.trim()) return envProjectId.trim();
  if (credentials?.project_id?.trim()) return credentials.project_id.trim();
  try {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      ...(credentials ? { credentials } : {}),
    });
    const projectId = await auth.getProjectId();
    return projectId?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function parseTranscript(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results)) return undefined;
  const parts: string[] = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const alternatives = (result as Record<string, unknown>).alternatives;
    if (!Array.isArray(alternatives) || alternatives.length === 0) continue;
    const first = alternatives[0];
    if (first && typeof first === "object") {
      const transcript = (first as Record<string, unknown>).transcript;
      if (typeof transcript === "string" && transcript.trim()) parts.push(transcript.trim());
    }
  }
  return parts.join(" ").trim() || undefined;
}

function decodeWavPcm16(
  input: Uint8Array,
): { pcm: Uint8Array; sampleRate: number } | undefined {
  if (input.byteLength < 44) return;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const readTag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") return;

  let offset = 12;
  let format:
    | { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number }
    | undefined;
  let dataOffset: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= input.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkId === "fmt ") {
      if (chunkSize < 16) return;
      format = {
        audioFormat: view.getUint16(offset, true),
        channels: view.getUint16(offset + 2, true),
        sampleRate: view.getUint32(offset + 4, true),
        bitsPerSample: view.getUint16(offset + 14, true),
      };
      offset += chunkSize;
      if (chunkSize % 2 === 1) offset += 1;
    } else if (chunkId === "data") {
      dataOffset = offset;
      dataSize = Math.min(chunkSize, input.byteLength - offset);
      break;
    } else {
      if (offset + chunkSize > input.byteLength) break;
      offset += chunkSize;
      if (chunkSize % 2 === 1) offset += 1;
    }
  }

  if (!format || dataOffset === undefined || dataSize === undefined) return;
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16) return;
  if (format.channels < 1) return;

  const bytesPerSample = 2;
  const frameSize = bytesPerSample * format.channels;
  const available = Math.min(dataSize, input.byteLength - dataOffset);
  const frameCount = Math.floor(available / frameSize);
  if (frameCount <= 0) return;

  if (format.channels === 1) {
    const pcmByteLength = frameCount * bytesPerSample;
    return {
      pcm: input.slice(dataOffset, dataOffset + pcmByteLength),
      sampleRate: format.sampleRate,
    };
  }

  const dv = new DataView(input.buffer, input.byteOffset + dataOffset, frameCount * frameSize);
  const buffer = Buffer.allocUnsafe(frameCount * bytesPerSample);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) {
      sum += dv.getInt16(i * frameSize + c * bytesPerSample, true);
    }
    buffer.writeInt16LE(Math.round(sum / format.channels), i * bytesPerSample);
  }
  return { pcm: buffer, sampleRate: format.sampleRate };
}

async function transcribeChirp2(params: {
  audio: Uint8Array;
  model: string;
  language: string;
  query?: ProviderQuery;
  credentials?: GoogleServiceAccountCredentials;
  timeoutMs: number;
  fetchFn: typeof fetch;
}): Promise<AudioTranscriptionResult> {
  const region = resolveRegion(params.query);
  const projectId =
    coerceString(params.query?.projectId) ?? (await getGoogleProjectId(params.credentials));
  if (!projectId) {
    throw new Error(
      "Chirp 2 requires a Google Cloud project ID. Set GOOGLE_CLOUD_PROJECT or provide a service account key.",
    );
  }
  const url = `https://${region}-speech.googleapis.com/v2/projects/${projectId}/locations/${region}/recognizers/_:recognize`;
  const token = await getGoogleAccessToken(params.credentials);
  const body = {
    config: {
      model: params.model,
      languageCodes: params.language === "auto" ? ["auto"] : [params.language],
      features: { enableAutomaticPunctuation: true },
      autoDecodingConfig: {},
    },
    content: Buffer.from(params.audio).toString("base64"),
  };
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    params.timeoutMs,
    params.fetchFn,
  );
  if (!res.ok) {
    const detail = await readErrorResponse(res);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Chirp 2 transcription failed (HTTP ${res.status})${suffix}`);
  }
  const payload = await res.json().catch(() => null);
  const text = parseTranscript(payload);
  if (!text) {
    throw new Error("Chirp 2 response missing text");
  }
  return { text, model: params.model };
}

async function transcribeV1(params: {
  audio: Uint8Array;
  model: string;
  language: string;
  alternativeLanguages?: string[];
  query?: ProviderQuery;
  apiKey?: string;
  credentials?: GoogleServiceAccountCredentials;
  baseUrl?: string;
  timeoutMs: number;
  fetchFn: typeof fetch;
}): Promise<AudioTranscriptionResult> {
  const decoded = decodeWavPcm16(params.audio);
  if (!decoded) {
    throw new Error(
      "Google STT v1 expects 16-bit PCM WAV audio. Use chirp_2 for auto decoding.",
    );
  }
  const baseUrl = normalizeBaseUrl(params.baseUrl, DEFAULT_GOOGLE_STT_BASE_URL);
  const url = new URL(`${baseUrl}/speech:recognize`);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.apiKey) {
    url.searchParams.set("key", params.apiKey);
  } else {
    const token = await getGoogleAccessToken(params.credentials);
    headers.Authorization = `Bearer ${token}`;
    const quotaProject =
      coerceString(params.query?.projectId) ?? (await getGoogleProjectId(params.credentials));
    if (quotaProject) headers["x-goog-user-project"] = quotaProject;
  }

  const body = {
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: decoded.sampleRate,
      languageCode: params.language,
      alternativeLanguageCodes: params.alternativeLanguages,
      enableAutomaticPunctuation: true,
    },
    audio: { content: Buffer.from(decoded.pcm).toString("base64") },
  };
  const res = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    params.timeoutMs,
    params.fetchFn,
  );
  if (!res.ok) {
    const detail = await readErrorResponse(res);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Google STT request failed (HTTP ${res.status})${suffix}`);
  }
  const payload = await res.json().catch(() => null);
  const text = parseTranscript(payload);
  if (!text) {
    throw new Error("Google STT response missing text");
  }
  return { text, model: params.model };
}

export async function transcribeGoogleSttAudio(
  params: AudioTranscriptionRequest,
): Promise<AudioTranscriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const model = normalizeModel(params.model);
  const language = resolveLanguage({ language: params.language, query: params.query });
  const altLanguages = resolveAlternativeLanguages(params.query);
  const { apiKey, credentials } = await resolveCredentials(params.apiKey);
  if (!credentials && model === "chirp_2") {
    if (!apiKey) {
      throw new Error(
        "Chirp 2 requires a Google service account key. Set GOOGLE_APPLICATION_CREDENTIALS or use agent-core auth login google-stt.",
      );
    }
    throw new Error(
      "Chirp 2 requires a service account JSON key. Provide a JSON key, not an API key.",
    );
  }

  if (model === "chirp_2") {
    return await transcribeChirp2({
      audio: params.buffer,
      model,
      language,
      query: params.query,
      credentials,
      timeoutMs: params.timeoutMs,
      fetchFn,
    });
  }

  return await transcribeV1({
    audio: params.buffer,
    model,
    language,
    alternativeLanguages: altLanguages,
    query: params.query,
    apiKey,
    credentials,
    baseUrl: params.baseUrl,
    timeoutMs: params.timeoutMs,
    fetchFn,
  });
}

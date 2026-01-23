import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { transcribeInworldAudio } from "../agents/agent-core-client.js";
import type { ZeeConfig } from "../config/config.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import { runExec } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { applyTemplate, type MsgContext } from "./templating.js";

const DEFAULT_INWORLD_SAMPLE_RATE = 16000;

export function isAudio(mediaType?: string | null) {
  return Boolean(mediaType?.startsWith("audio"));
}

export async function transcribeInboundAudio(
  cfg: ZeeConfig,
  ctx: MsgContext,
  runtime: RuntimeEnv,
): Promise<{ text: string } | undefined> {
  const transcriber = cfg.routing?.transcribeAudio;
  if (!transcriber) return undefined;

  const timeoutMs = Math.max((transcriber.timeoutSeconds ?? 45) * 1000, 1_000);
  let tmpPath: string | undefined;
  let mediaPath = ctx.MediaPath;
  try {
    if (!mediaPath && ctx.MediaUrl) {
      const res = await fetch(ctx.MediaUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      tmpPath = path.join(os.tmpdir(), `zee-audio-${crypto.randomUUID()}.ogg`);
      await fs.writeFile(tmpPath, buffer);
      mediaPath = tmpPath;
      if (shouldLogVerbose()) {
        logVerbose(
          `Downloaded audio for transcription (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) -> ${tmpPath}`,
        );
      }
    }
    if (!mediaPath) return undefined;

    if ("provider" in transcriber && transcriber.provider === "inworld") {
      const wavBuffer = await resolveWavBuffer(
        mediaPath,
        timeoutMs,
        transcriber.sampleRate ?? DEFAULT_INWORLD_SAMPLE_RATE,
        runtime,
      );
      if (!wavBuffer) return undefined;
      const text = await transcribeInworldAudio({ audio: wavBuffer, timeoutMs });
      if (!text) return undefined;
      return { text };
    }

    if (!("command" in transcriber) || !transcriber.command?.length) return undefined;

    const templCtx: MsgContext = { ...ctx, MediaPath: mediaPath };
    const argv = transcriber.command.map((part) =>
      applyTemplate(part, templCtx),
    );
    if (shouldLogVerbose()) {
      logVerbose(`Transcribing audio via command: ${argv.join(" ")}`);
    }
    const { stdout } = await runExec(argv[0], argv.slice(1), {
      timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    const text = stdout.trim();
    if (!text) return undefined;
    return { text };
  } catch (err) {
    runtime.error?.(`Audio transcription failed: ${String(err)}`);
    return undefined;
  } finally {
    if (tmpPath) {
      void fs.unlink(tmpPath).catch(() => {});
    }
  }
}

async function resolveWavBuffer(
  mediaPath: string,
  timeoutMs: number,
  sampleRate: number,
  runtime: RuntimeEnv,
): Promise<Buffer | undefined> {
  const raw = await fs.readFile(mediaPath);
  if (isWavBuffer(raw)) return raw;

  const converted = await convertToWav(mediaPath, timeoutMs, sampleRate);
  if (!converted && runtime.error) {
    runtime.error(
      "Inworld transcription requires WAV audio; install ffmpeg or sox or provide a WAV file.",
    );
  }
  return converted;
}

function isWavBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

async function convertToWav(
  mediaPath: string,
  timeoutMs: number,
  sampleRate: number,
): Promise<Buffer | undefined> {
  const conversions = [
    {
      command: "ffmpeg",
      args: [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        mediaPath,
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        "-f",
        "wav",
      ],
    },
    {
      command: "sox",
      args: [
        mediaPath,
        "-r",
        String(sampleRate),
        "-c",
        "1",
        "-b",
        "16",
        "-e",
        "signed-integer",
        "-t",
        "wav",
      ],
    },
  ];

  for (const conversion of conversions) {
    const tmpPath = path.join(os.tmpdir(), `zee-audio-${crypto.randomUUID()}.wav`);
    try {
      await runExec(conversion.command, [...conversion.args, tmpPath], {
        timeoutMs,
        maxBuffer: 1024 * 1024,
      });
      const buffer = await fs.readFile(tmpPath);
      if (buffer.length > 0) return buffer;
    } catch (err) {
      if (shouldLogVerbose()) {
        logVerbose(
          `Audio conversion failed (${conversion.command}): ${String(err)}`,
        );
      }
    } finally {
      void fs.unlink(tmpPath).catch(() => {});
    }
  }

  return undefined;
}

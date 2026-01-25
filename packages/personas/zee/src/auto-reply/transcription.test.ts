import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../globals.js", () => ({
  isVerbose: () => false,
  logVerbose: vi.fn(),
  shouldLogVerbose: () => false,
}));

vi.mock("../process/exec.js", () => ({
  runExec: vi.fn(),
}));

vi.mock("../agents/agent-core-client.js", () => ({
  transcribeGoogleAudio: vi.fn(),
}));

const runtime = {
  error: vi.fn(),
};

describe("transcribeInboundAudio", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads mediaUrl to temp file and returns transcript", async () => {
    const tmpBuf = Buffer.from("audio-bytes");
    const tmpFile = path.join(os.tmpdir(), `zee-audio-${Date.now()}.ogg`);
    await fs.writeFile(tmpFile, tmpBuf);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => tmpBuf,
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const cfg = {
      routing: {
        transcribeAudio: {
          command: ["echo", "{{MediaPath}}"],
          timeoutSeconds: 5,
        },
      },
    };
    const ctx = { MediaUrl: "https://example.com/audio.ogg" };

    const execModule = await import("../process/exec.js");
    vi.mocked(execModule.runExec).mockResolvedValue({
      stdout: "transcribed text\n",
      stderr: "",
    });
    const { transcribeInboundAudio } = await import("./transcription.js");
    const result = await transcribeInboundAudio(
      cfg as never,
      ctx as never,
      runtime as never,
    );
    expect(result?.text).toBe("transcribed text");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns undefined when no transcription command", async () => {
    const { transcribeInboundAudio } = await import("./transcription.js");
    const res = await transcribeInboundAudio(
      { routing: {} } as never,
      {} as never,
      runtime as never,
    );
    expect(res).toBeUndefined();
  });

  it("uses agent-core Google transcription when configured", async () => {
    const wav = buildWav(new Int16Array([0, 32767]), 16000);
    const tmpFile = path.join(os.tmpdir(), `zee-audio-${Date.now()}.wav`);
    await fs.writeFile(tmpFile, wav);

    const agentCoreModule = await import("../agents/agent-core-client.js");
    vi.mocked(agentCoreModule.transcribeGoogleAudio).mockResolvedValue(
      "hello",
    );

    const { transcribeInboundAudio } = await import("./transcription.js");
    const result = await transcribeInboundAudio(
      {
        routing: {
          transcribeAudio: {
            provider: "google",
            timeoutSeconds: 5,
          },
        },
      } as never,
      { MediaPath: tmpFile } as never,
      runtime as never,
    );
    expect(result?.text).toBe("hello");
    expect(agentCoreModule.transcribeGoogleAudio).toHaveBeenCalled();

    await fs.unlink(tmpFile);
  });
});

function buildWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample * channels;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i] ?? 0, 44 + i * 2);
  }
  return new Uint8Array(buffer);
}

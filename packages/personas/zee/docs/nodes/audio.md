---
summary: "How inbound audio/voice notes are downloaded, transcribed, and injected into replies"
read_when:
  - Changing audio transcription or media handling
---
# Audio / Voice Notes — 2025-12-05

## What works
- **Optional transcription**: If `routing.transcribeAudio.command` is set in `~/.zee/zee.json`, ZEE will:
  1) Download inbound audio to a temp path when WhatsApp only provides a URL.
  2) Run the configured CLI (templated with `{{MediaPath}}`), expecting transcript on stdout.
  3) Replace `Body` with the transcript, set `{{Transcript}}`, and prepend the original media path plus a `Transcript:` section in the command prompt so models see both.
  4) Continue through the normal auto-reply pipeline (templating, sessions, Pi command).
- **Inworld STT (agent-core)**: If `routing.transcribeAudio.provider` is set to `"inworld"`, Zee sends WAV audio to the agent-core daemon, which uses its Inworld Runtime STT config.
- **Verbose logging**: In `--verbose`, we log when transcription runs and when the transcript replaces the body.

## Config example (OpenAI Whisper CLI)
Requires `OPENAI_API_KEY` in env and `openai` CLI installed:
```json5
{
  routing: {
    transcribeAudio: {
      command: [
        "openai",
        "api",
        "audio.transcriptions.create",
        "-m",
        "whisper-1",
        "-f",
        "{{MediaPath}}",
        "--response-format",
        "text"
      ],
      timeoutSeconds: 45
    }
  }
}
```

## Config example (Inworld Runtime via agent-core)
Requires agent-core daemon with Inworld auth configured (`INWORLD_API_KEY`, `INWORLD_STT_ENDPOINT`):
```json5
{
  routing: {
    transcribeAudio: {
      provider: "inworld",
      timeoutSeconds: 45,
      sampleRate: 16000
    }
  }
}
```

## Notes & limits
- Command mode uses any CLI that prints text to stdout (Whisper cloud, whisper.cpp, vosk, Deepgram, etc.).
- Inworld mode uses the agent-core daemon and expects WAV audio; Zee will try `ffmpeg` or `sox` to convert non-WAV files.
- Size guard: inbound audio must be ≤5 MB (matches the temp media store and transcript pipeline).
- Outbound caps: web send supports audio/voice up to 16 MB (sent as a voice note with `ptt: true`).
- If transcription fails, we fall back to the original body/media note; replies still go through.
- Transcript is available to templates as `{{Transcript}}`; models get both the media path and a `Transcript:` block in the prompt when using command mode.

## Gotchas
- Ensure your CLI exits 0 and prints plain text; JSON needs to be massaged via `jq -r .text`.
- Keep timeouts reasonable (`timeoutSeconds`, default 45s) to avoid blocking the reply queue.

---
name: google-chirp-2
description: Single STT source for the entire system. Google Chirp 2 handles all speech-to-text across TUI dictation and messaging platforms (WhatsApp, Telegram voice messages).
homepage: https://cloud.google.com/speech-to-text/v2/docs
metadata: {"zee":{"emoji":"🎙️","requires":{"env":["GOOGLE_APPLICATION_CREDENTIALS"]}}}
---

# Google Chirp 2 - Unified STT

**The single source of speech-to-text for the entire system.**

## Architecture Principle

All speech-to-text flows through Google Chirp 2 - no exceptions:

```
┌─────────────────────────────────────────────────────────┐
│                 SINGLE STT SOURCE                        │
│                  Google Chirp 2                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   TUI Dictation ──────┐                                 │
│                       │                                 │
│   WhatsApp Voice ─────┼──→ Google Chirp 2 ──→ Text     │
│                       │                                 │
│   Telegram Voice ─────┘                                 │
│                                                         │
│   ════════════════════════════════════════════════════  │
│   Unified Sessions: TUI + Messages = Same Session       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Why Single Source?

1. **Consistency** - Same transcription quality everywhere
2. **Unified Sessions** - TUI and messaging share the same session context
3. **Simplified Architecture** - One integration to maintain
4. **Cost Efficiency** - Single billing, single quota management

## Input Sources

| Source | Format | Flow |
|--------|--------|------|
| TUI Dictation | Live microphone stream | Real-time transcription |
| WhatsApp Voice | .ogg/.opus files | Async transcription |
| Telegram Voice | .ogg/.oga files | Async transcription |

## Setup

### 1. Google Cloud Credentials

```bash
# Set up service account credentials
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/application_default_credentials.json"

# Or use application default credentials
gcloud auth application-default login
```

### 2. Enable Speech-to-Text API

```bash
gcloud services enable speech.googleapis.com
```

### 3. Configure Project

```bash
gcloud config set project YOUR_PROJECT_ID
```

## API Usage

### Streaming (TUI Dictation)

For real-time dictation in the TUI:

```typescript
import { SpeechClient } from '@google-cloud/speech';

const client = new SpeechClient();

const request = {
  config: {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    model: 'chirp_2',  // Chirp 2 model
    useEnhanced: true,
  },
  interimResults: true,  // For live feedback
};

const stream = client.streamingRecognize(request);
```

### Async (Voice Messages)

For WhatsApp/Telegram voice messages:

```typescript
import { SpeechClient } from '@google-cloud/speech';

const client = new SpeechClient();

async function transcribeVoiceMessage(audioBuffer: Buffer, mimeType: string) {
  const [response] = await client.recognize({
    config: {
      encoding: mimeType.includes('opus') ? 'OGG_OPUS' : 'OGG_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      model: 'chirp_2',
    },
    audio: {
      content: audioBuffer.toString('base64'),
    },
  });

  return response.results
    ?.map(r => r.alternatives?.[0]?.transcript)
    .join(' ');
}
```

## Supported Languages

Chirp 2 supports 100+ languages with automatic language detection:

```typescript
const config = {
  model: 'chirp_2',
  languageCode: 'auto',  // Auto-detect
  // Or specify: 'en-US', 'pt-BR', 'es-ES', etc.
};
```

## Session Unification

When a voice message arrives via WhatsApp/Telegram, it's transcribed and injected into the **same session** as TUI interactions:

```
User (TUI):      "Check my calendar"
Agent:           "You have 3 meetings today..."
User (WhatsApp): [Voice: "Add lunch with Sarah at noon"]
                 → Transcribed → Same session context
Agent:           "Added lunch with Sarah at 12:00 PM"
User (TUI):      "What did I just add?"
Agent:           "You added lunch with Sarah at noon"
```

## Cost Optimization

| Feature | Cost Impact |
|---------|-------------|
| Chirp 2 model | Premium pricing, best quality |
| Streaming | Per-15-second billing |
| Async | Per-15-second billing |
| Data logging disabled | No additional storage cost |

### Disable Data Logging (Recommended)

```typescript
const config = {
  model: 'chirp_2',
  // Disable data logging for privacy
  metadata: {
    interactionType: 'DICTATION',
    industryNaicsCodeOfAudio: 0,  // Unspecified
  },
};
```

## Error Handling

```typescript
try {
  const transcript = await transcribe(audio);
} catch (error) {
  if (error.code === 8) {
    // RESOURCE_EXHAUSTED - quota exceeded
    console.error('Quota exceeded, implement backoff');
  } else if (error.code === 3) {
    // INVALID_ARGUMENT - bad audio format
    console.error('Invalid audio format');
  }
}
```

## Integration Points

- **TUI**: `packages/agent-core/src/tui/dictation.ts`
- **Voice Messages**: `packages/personas/zee/src/media-understanding/`
- **Unified Sessions**: `packages/tiara/src/sessions/`

## Guardrails

- **Never** store raw audio after transcription
- **Never** log transcription content in production
- **Always** use secure credential management
- **Always** respect user privacy settings

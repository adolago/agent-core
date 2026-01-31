# Extended Provider Blacklist Analysis

Complete analysis of all providers including utility providers and Google variants.

---

## Currently Blocked (9 Providers)

```typescript
const PROVIDER_BLACKLIST = new Set<string>([
  "nebius",           // Permanently disabled
  "venice",           // Privacy proxy removed
  "alibaba",          // Removed per request
  "synthetic",        // Redundant HuggingFace proxy
  "ollama",           // Local provider - use vLLM instead
  "github-copilot",   // Subscription-based, limited models
  "amazon-bedrock",   // Enterprise AWS only
  "qwen-portal",      // OAuth complexity, limited models
  "moonshot",         // Duplicate of kimi-for-coding
])
```

---

## Active LLM Providers (10)

| Provider | Type | Block Recommendation |
|----------|------|---------------------|
| **anthropic** | Core LLM | KEEP |
| **openai** | Core LLM | KEEP |
| **google** | Core LLM (AI Studio API) | KEEP |
| **google-gemini-cli** | OAuth (Gemini CLI) | KEEP |
| **google-antigravity** | OAuth (Cloud Code) | KEEP |
| **xai** | Long Context | KEEP |
| **deepseek** | Budget | KEEP |
| **minimax** | Niche | KEEP |
| **zai-coding-plan** | GLM | KEEP (PAID) |
| **kimi-for-coding** | Coding | KEEP |
| **opencode** | Multi-model Proxy | KEEP |
| **openrouter** | Aggregator | KEEP |

---

## Utility Providers (Separately Blockable)

### Embedding Providers

| Provider ID | Service | Env Var | Models |
|-------------|---------|---------|--------|
| `openai` | Embedding | `OPENAI_API_KEY` | text-embedding-3-small/large |
| `google` | Embedding | `GOOGLE_API_KEY` | gemini-embedding-001 |
| `voyage` | Embedding/Reranking | `VOYAGE_API_KEY` | voyage-3-large, voyage-3, voyage-3-lite |
| `vllm` | Embedding/Reranking | `VLLM_BASE_URL` | User-configurable |

**Note:** Voyage is shared between embedding and reranking.

---

### Reranking Providers

| Provider ID | Service | Env Var | Default Model |
|-------------|---------|---------|---------------|
| `voyage` | Reranking | `VOYAGE_API_KEY` | rerank-2 |
| `vllm` | Reranking | `VLLM_RERANKER_URL` | BAAI/bge-reranker-v2-m3 |

---

### TTS Providers

| Provider ID | Service | Env Var | Models |
|-------------|---------|---------|--------|
| `openai` | TTS | `OPENAI_API_KEY` | gpt-4o-mini-tts, tts-1, tts-1-hd |
| `elevenlabs` | TTS | `ELEVENLABS_API_KEY` | eleven_multilingual_v2 |
| `minimax` | TTS | `MINIMAX_API_KEY` | speech-2.8-hd |
| `edge` | TTS | None | Microsoft Edge voices |

---

### STT Providers

| Provider ID | Service | Env Var | Default Model |
|-------------|---------|---------|---------------|
| `google` | STT (Gemini) | `GOOGLE_API_KEY` | gemini-3-flash-preview |
| `google-stt` | STT (Chirp 2) | `GOOGLE_STT_API_KEY` | chirp_2 |
| `openai` | STT | `OPENAI_API_KEY` | gpt-4o-mini-transcribe |
| `deepgram` | STT | `DEEPGRAM_API_KEY` | nova-3 |
| `groq` | STT | `GROQ_API_KEY` | whisper-large-v3-turbo |

---

## Google Provider Variants (3 Separate Providers)

Google has **3 distinct provider IDs** that can be blocked separately:

### 1. `google` - Google AI Studio API
- **Service:** Main LLM, Embedding, Gemini STT
- **Env Var:** `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- **Models:** gemini-3-pro/flash-preview, gemini-embedding-001
- **Auth:** API Key

### 2. `google-gemini-cli` - Gemini CLI OAuth
- **Service:** LLM via Gemini CLI
- **Env Vars:** `ZEE_GEMINI_OAUTH_CLIENT_ID`, `GEMINI_CLI_OAUTH_CLIENT_SECRET`
- **Default Model:** google-gemini-cli/gemini-3-pro-preview
- **Auth:** OAuth (PKCE + localhost callback)
- **Scopes:** cloud-platform, userinfo

### 3. `google-antigravity` - Google Cloud Code (Antigravity)
- **Service:** LLM via Cloud Code Assist
- **Default Model:** google-antigravity/claude-opus-4-5-thinking
- **Auth:** OAuth (PKCE + localhost callback)
- **Scopes:** cloud-platform, cclog, experimentsandconfigs

### To Block Google Variants Individually:

```typescript
// Block only Gemini CLI
"google-gemini-cli"

// Block only Antigravity
"google-antigravity"

// Block main Google AI Studio (keeps CLI/Antigravity)
"google"
```

---

## Provider Granularity Summary

| Category | Count | Can Block Individually |
|----------|-------|------------------------|
| LLM Providers | 10 | Yes |
| Google Variants | 3 | Yes (google, google-gemini-cli, google-antigravity) |
| Embedding | 4 | Yes (openai, google, voyage, vllm) |
| Reranking | 2 | Yes (voyage, vllm) |
| TTS | 4 | Yes (openai, elevenlabs, minimax, edge) |
| STT | 5 | Yes (google, google-stt, openai, deepgram, groq) |

**Total Blockable Provider IDs:** ~28

---

## Recommended Minimal Setup

If you want to block by service type:

```typescript
// Block all TTS
const blockTTS = ["elevenlabs", "minimax", "edge"];

// Block all STT except Google
const blockSTT = ["deepgram", "groq"];

// Block all reranking (if not using)
const blockRerank = ["voyage"];

// Block Google variants (keep main google)
const blockGoogleVariants = ["google-gemini-cli", "google-antigravity"];
```

---

## Complete Provider Registry

### LLM (12)
anthropic, openai, google, google-gemini-cli, google-antigravity, xai, deepseek, minimax, zai-coding-plan, kimi-for-coding, opencode, openrouter

### Embedding (4)
openai, google, voyage, vllm

### Reranking (2)
voyage, vllm

### TTS (4)
openai, elevenlabs, minimax, edge

### STT (5)
google, google-stt, openai, deepgram, groq

### Image (1)
openai

### Web Search (2)
brave, perplexity

**Total: ~30 distinct provider IDs**

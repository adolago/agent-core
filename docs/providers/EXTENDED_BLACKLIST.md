# Extended Provider Blacklist Analysis

Complete analysis of all remaining providers for potential blacklisting.

---

## Currently Blocked (10 Providers)

```typescript
const PROVIDER_BLACKLIST = new Set<string>([
  "nebius",           // Permanently disabled
  "venice",           // Privacy proxy removed
  "alibaba",          // Removed per request
  "synthetic",        // Redundant HuggingFace proxy
  "ollama",           // Local provider - use vLLM instead
  "github-copilot",   // Subscription-based, limited models
  "amazon-bedrock",   // Enterprise AWS only
  "opencode",         // Unstable internal proxy
  "qwen-portal",      // OAuth complexity, limited models
  "moonshot",         // Duplicate of kimi-for-coding
])
```

---

## Remaining Active Providers (8)

| Provider | Status | Recommendation |
|----------|--------|----------------|
| anthropic | Core | **KEEP** - Essential |
| openai | Core | **KEEP** - Essential |
| google | Core | **KEEP** - Essential |
| xai | Secondary | **KEEP** - Good alternative |
| deepseek | Secondary | **KEEP** - Cost-effective |
| minimax | Niche | CONSIDER BLOCK |
| zai-coding-plan | Niche | CONSIDER BLOCK |
| kimi-for-coding | Niche | CONSIDER BLOCK |
| openrouter | Aggregator | **KEEP** - Useful fallback |

---

## More Candidates to Block

### 1. MiniMax (`minimax`) - CONSIDER
**Why block:**
- Chinese provider with limited English support
- Only 2 models (M2, M2.1)
- Anthropic-compatible API (non-standard)
- Overlaps with other providers' capabilities

**Verdict:** CONSIDER BLOCK - Niche provider

---

### 2. Z.AI Coding Plan (`zai-coding-plan`) - CONSIDER
**Why block:**
- Single model (glm-4.7)
- Chinese-focused (Zhipu AI)
- Limited global availability
- Overlaps with OpenAI/Anthropic for coding

**Verdict:** CONSIDER BLOCK - Very niche

---

### 3. Kimi for Coding (`kimi-for-coding`) - CONSIDER
**Why block:**
- Limited to coding tasks (narrow scope)
- Only 3 models (K2.5, K2.5-thinking variants)
- Moonshot already consolidated here
- Overlaps with Claude/GPT for coding

**Verdict:** CONSIDER BLOCK - Specialized but redundant

---

### 4. OpenRouter (`openrouter`) - KEEP
**Why keep:**
- Aggregates 100+ models
- Good fallback when direct providers fail
- Single API key for multiple providers
- Cost comparison features

**Verdict:** KEEP - Useful aggregator

---

### 5. xAI (`xai`) - KEEP
**Why keep:**
- Unique 2M context window
- Grok models different from GPT/Claude
- Good for long document processing
- X Premium integration

**Verdict:** KEEP - Unique capability

---

### 6. DeepSeek (`deepseek`) - KEEP
**Why keep:**
- Cost-effective reasoning
- Popular for coding tasks
- Good OpenAI alternative
- Active development

**Verdict:** KEEP - Popular alternative

---

## Minimal Provider Setup

If you want the **leanest possible setup**, keep only:

```typescript
const PROVIDER_BLACKLIST = new Set<string>([
  // ... all current blocks ...
  "minimax",          // Block - niche Chinese
  "zai-coding-plan",  // Block - niche GLM
  "kimi-for-coding",  // Block - niche coding-only
])
```

**Result: Core 5 Providers**
1. anthropic - Claude models
2. openai - GPT models
3. google - Gemini models
4. xai - Grok models
5. deepseek - Reasoning models
6. openrouter - Fallback aggregator

---

## Ultra-Minimal Setup (3 Providers)

For the absolute minimum:

```typescript
const PROVIDER_BLACKLIST = new Set<string>([
  // ... all current blocks ...
  "minimax",
  "zai-coding-plan", 
  "kimi-for-coding",
  "xai",              // Block - if you don't need 2M context
  "deepseek",         // Block - if you have OpenAI/Anthropic
  "openrouter",       // Block - if you don't need fallback
])
```

**Result: Core 3**
1. anthropic
2. openai
3. google

---

## Provider Capability Matrix

| Provider | Chat | Code | Vision | Reasoning | Long Context | Cost |
|----------|------|------|--------|-----------|--------------|------|
| anthropic | ✅ | ✅ | ✅ | ✅ | 200K | Medium |
| openai | ✅ | ✅ | ✅ | ✅ | 400K | High |
| google | ✅ | ✅ | ✅ | ✅ | 1M | Low |
| xai | ✅ | ✅ | ✅ | ✅ | 2M | Medium |
| deepseek | ✅ | ✅ | ❌ | ✅ | 128K | Low |
| minimax | ✅ | ✅ | ✅ | ✅ | 204K | Medium |
| zai | ✅ | ✅ | ❌ | ✅ | 204K | Low |
| kimi | ✅ | ✅ | ✅ | ✅ | 256K | Medium |
| openrouter | ✅ | ✅ | ✅ | ✅ | Varies | Varies |

---

## Recommendations

### Conservative (Keep 8)
Keep all remaining providers except none.

### Moderate (Keep 6)
Block: minimax, zai-coding-plan

### Aggressive (Keep 5)
Block: minimax, zai-coding-plan, kimi-for-coding

### Minimal (Keep 3-4)
Block: minimax, zai-coding-plan, kimi-for-coding, xai, deepseek

---

## Next Steps

Which providers do you want to block next?

1. **minimax** - Chinese provider
2. **zai-coding-plan** - GLM models
3. **kimi-for-coding** - Coding-focused
4. **xai** - Grok (if you don't need 2M context)
5. **deepseek** - Budget reasoning (if covered by others)
6. **openrouter** - Aggregator (if you trust direct providers)

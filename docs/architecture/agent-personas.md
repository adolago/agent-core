# Agent Persona System Architecture

## Overview

The agent persona system provides a unified approach to agent identity and behavior configuration across three use cases:

1. **Stanley** - Professional financial analysis platform
2. **Zee** - Personal AI assistant
3. **OpenCode** - Development agent (inherited patterns)

## Design Principles

### 1. Layered Identity Model

```
+----------------------------------+
|          Soul Layer              |  <- Core values, personality
|    (SOUL.md / soul.yaml)         |
+----------------------------------+
|        Identity Layer            |  <- Name, description, vibe
|  (IDENTITY.md / identity.yaml)   |
+----------------------------------+
|        Persona Layer             |  <- Role-specific config
|    (personas/*.yaml)             |
+----------------------------------+
|       Capability Layer           |  <- Tools, permissions
|    (runtime configuration)       |
+----------------------------------+
```

### 2. Context Hierarchy

```
Global Identity (~/clawd/)
    |
    +-- Project Personas (.agent-core/persona/)
    |       |
    |       +-- Session Overrides (runtime)
    |
    +-- Built-in Personas (src/agent/personas/)
```

## Component Design

### Core Types (`src/agent/agent.ts`)

```typescript
import { z } from 'zod';

// Permission levels
export const Permission = z.enum(['allow', 'ask', 'deny']);
export type Permission = z.infer<typeof Permission>;

// Agent operating modes
export const AgentMode = z.enum(['primary', 'subagent', 'all']);
export type AgentMode = z.infer<typeof AgentMode>;

// Model configuration
export const ModelConfig = z.object({
  providerID: z.string(),
  modelID: z.string(),
});
export type ModelConfig = z.infer<typeof ModelConfig>;

// Permission configuration
export const PermissionConfig = z.object({
  edit: Permission.optional().default('allow'),
  bash: z.union([
    Permission,
    z.record(z.string(), Permission)
  ]).optional().default('allow'),
  skill: z.union([
    Permission,
    z.record(z.string(), Permission)
  ]).optional().default('allow'),
  mcp: z.union([
    Permission,
    z.record(z.string(), Permission)
  ]).optional().default('allow'),
  webfetch: Permission.optional().default('allow'),
  external_directory: Permission.optional().default('ask'),
});
export type PermissionConfig = z.infer<typeof PermissionConfig>;

// Tool configuration
export const ToolConfig = z.object({
  whitelist: z.array(z.string()).optional(),
  blacklist: z.array(z.string()).optional(),
  overrides: z.record(z.string(), z.boolean()).optional(),
});
export type ToolConfig = z.infer<typeof ToolConfig>;

// Base agent interface
export const AgentInfo = z.object({
  // Identity
  name: z.string(),
  description: z.string().optional(),

  // Mode
  mode: AgentMode.default('primary'),
  native: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  default: z.boolean().optional().default(false),

  // Model settings
  model: ModelConfig.optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxSteps: z.number().int().positive().optional(),

  // Behavior
  prompt: z.string().optional(),
  permission: PermissionConfig.optional(),
  tools: ToolConfig.optional(),

  // Metadata
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  options: z.record(z.string(), z.any()).optional(),
});
export type AgentInfo = z.infer<typeof AgentInfo>;
```

### Persona System (`src/agent/persona.ts`)

```typescript
import { z } from 'zod';
import { AgentInfo } from './agent';

// Soul layer - core values and personality
export const Soul = z.object({
  truths: z.array(z.string()),
  boundaries: z.array(z.string()),
  vibe: z.object({
    traits: z.array(z.string()),
    communication: z.string().optional(),
  }),
  directives: z.record(z.string(), z.string()).optional(),
});
export type Soul = z.infer<typeof Soul>;

// Identity layer - who the agent is
export const Identity = z.object({
  name: z.string(),
  creature: z.string().optional(),
  vibe: z.string().optional(),
  emoji: z.string().optional(),
  about: z.string().optional(),
  infrastructure: z.record(z.string(), z.string()).optional(),
  continuity: z.string().optional(),
});
export type Identity = z.infer<typeof Identity>;

// Persona definition - role-specific configuration
export const PersonaDefinition = z.object({
  // Frontmatter (markdown-style)
  name: z.string(),
  description: z.string(),
  mode: z.enum(['primary', 'subagent', 'all']).default('primary'),

  // Use case
  useCase: z.enum(['stanley', 'zee', 'opencode', 'custom']).optional(),

  // Model preferences
  model: z.string().optional(), // format: provider/model
  temperature: z.number().optional(),
  topP: z.number().optional(),

  // Tool configuration
  tools: z.record(z.string(), z.boolean()).optional(),

  // Permission overrides
  permission: z.object({
    edit: z.enum(['allow', 'ask', 'deny']).optional(),
    bash: z.union([
      z.enum(['allow', 'ask', 'deny']),
      z.record(z.string(), z.enum(['allow', 'ask', 'deny']))
    ]).optional(),
  }).optional(),

  // System prompt (markdown content)
  prompt: z.string().optional(),

  // Inheritance
  extends: z.string().optional(),
});
export type PersonaDefinition = z.infer<typeof PersonaDefinition>;

// Persona loading configuration
export const PersonaConfig = z.object({
  // Identity files
  identityPath: z.string().optional(), // path to IDENTITY.md
  soulPath: z.string().optional(),      // path to SOUL.md

  // Persona directories
  personaDirs: z.array(z.string()).optional(),

  // Active persona
  activePersona: z.string().optional(),
});
export type PersonaConfig = z.infer<typeof PersonaConfig>;
```

### Permission Evaluation (`src/agent/permission.ts`)

```typescript
import { z } from 'zod';
import { Permission, PermissionConfig } from './agent';

// Permission request context
export const PermissionContext = z.object({
  type: z.enum(['edit', 'bash', 'skill', 'mcp', 'webfetch', 'external_directory']),
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
  sessionID: z.string(),
  messageID: z.string(),
  callID: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type PermissionContext = z.infer<typeof PermissionContext>;

// Permission evaluation result
export const PermissionResult = z.object({
  allowed: z.boolean(),
  requiresAsk: z.boolean(),
  matchedRule: z.string().optional(),
  reason: z.string().optional(),
});
export type PermissionResult = z.infer<typeof PermissionResult>;

/**
 * Permission evaluation functions
 */
export namespace PermissionEvaluator {

  /**
   * Evaluate permission for a given context
   */
  export function evaluate(
    config: PermissionConfig,
    context: PermissionContext
  ): PermissionResult {
    const { type, pattern } = context;

    // Get the permission rule for this type
    const rule = config[type as keyof PermissionConfig];

    if (rule === undefined) {
      return { allowed: true, requiresAsk: false };
    }

    // Simple permission value
    if (typeof rule === 'string') {
      return evaluateSimple(rule as Permission);
    }

    // Pattern-based permission (bash, skill, mcp)
    if (typeof rule === 'object' && pattern) {
      return evaluatePattern(rule, pattern);
    }

    return { allowed: true, requiresAsk: false };
  }

  function evaluateSimple(permission: Permission): PermissionResult {
    switch (permission) {
      case 'allow':
        return { allowed: true, requiresAsk: false };
      case 'ask':
        return { allowed: false, requiresAsk: true };
      case 'deny':
        return { allowed: false, requiresAsk: false, reason: 'Permission denied' };
    }
  }

  function evaluatePattern(
    rules: Record<string, Permission>,
    pattern: string | string[]
  ): PermissionResult {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];

    for (const pat of patterns) {
      // Check exact match first
      if (rules[pat]) {
        return evaluateSimple(rules[pat]);
      }

      // Check wildcard patterns
      for (const [rulePattern, permission] of Object.entries(rules)) {
        if (wildcardMatch(pat, rulePattern)) {
          return { ...evaluateSimple(permission), matchedRule: rulePattern };
        }
      }
    }

    // Default to wildcard rule or allow
    const defaultRule = rules['*'];
    if (defaultRule) {
      return { ...evaluateSimple(defaultRule), matchedRule: '*' };
    }

    return { allowed: true, requiresAsk: false };
  }

  function wildcardMatch(value: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return value.startsWith(pattern.slice(0, -1));
    }
    return value === pattern;
  }

  /**
   * Merge permission configurations (override takes precedence)
   */
  export function merge(
    base: PermissionConfig,
    override: Partial<PermissionConfig>
  ): PermissionConfig {
    const result: PermissionConfig = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) continue;

      const baseValue = base[key as keyof PermissionConfig];

      // If both are objects, deep merge
      if (typeof baseValue === 'object' && typeof value === 'object') {
        result[key as keyof PermissionConfig] = {
          ...baseValue,
          ...value
        } as any;
      } else {
        result[key as keyof PermissionConfig] = value as any;
      }
    }

    return result;
  }
}
```

## Built-in Personas

### Directory Structure

```
src/agent/personas/
  |
  +-- opencode/           # Inherited from OpenCode
  |   +-- build.yaml      # Full-access development
  |   +-- plan.yaml       # Read-only analysis
  |   +-- general.yaml    # Complex task subagent
  |   +-- explore.yaml    # Fast codebase exploration
  |
  +-- stanley/            # Professional financial analysis
  |   +-- analyst.yaml    # Comprehensive financial analysis
  |   +-- researcher.yaml # Deep research and due diligence
  |   +-- quant.yaml      # Quantitative analysis
  |   +-- macro.yaml      # Macroeconomic analysis (subagent)
  |
  +-- zee/                # Personal assistant
  |   +-- assistant.yaml  # Default personal assistant
  |   +-- coder.yaml      # Technical help mode
  |   +-- researcher.yaml # Information gathering
  |
  +-- base/               # Shared base configurations
      +-- development.yaml
      +-- research.yaml
      +-- analysis.yaml
```

### OpenCode Personas

#### build.yaml
```yaml
name: build
description: Full-access development agent for code creation and modification
mode: primary
useCase: opencode

permission:
  edit: allow
  bash:
    "*": allow
  skill:
    "*": allow
  webfetch: allow

tools:
  "*": true
```

#### plan.yaml
```yaml
name: plan
description: Read-only analysis agent for planning and review
mode: primary
useCase: opencode

permission:
  edit: deny
  bash:
    "cut*": allow
    "diff*": allow
    "du*": allow
    "file *": allow
    "find * -delete*": ask
    "find * -exec*": ask
    "find *": allow
    "git diff*": allow
    "git log*": allow
    "git show*": allow
    "git status*": allow
    "git branch": allow
    "grep*": allow
    "head*": allow
    "ls*": allow
    "rg*": allow
    "tail*": allow
    "tree*": allow
    "*": ask
  webfetch: allow

tools:
  edit: false
  write: false
```

#### general.yaml
```yaml
name: general
description: General-purpose agent for complex tasks and parallel execution
mode: subagent
useCase: opencode
hidden: true

tools:
  todoread: false
  todowrite: false
```

#### explore.yaml
```yaml
name: explore
description: Fast agent for codebase exploration and search
mode: subagent
useCase: opencode

tools:
  todoread: false
  todowrite: false
  edit: false
  write: false

prompt: |
  You are a fast, focused codebase exploration agent. Your job is to:
  1. Find files matching patterns
  2. Search code for keywords
  3. Answer questions about the codebase structure

  When asked, specify thoroughness: "quick", "medium", or "very thorough"
```

### Stanley Personas

#### analyst.yaml
```yaml
name: analyst
description: Comprehensive financial analysis agent for institutional investment
mode: primary
useCase: stanley
color: "#2563eb"

model: openrouter/anthropic/claude-sonnet-4
temperature: 0.3

permission:
  bash:
    "*": deny
  edit: deny

tools:
  market_data: true
  fundamentals: true
  technicals: true
  portfolio: true
  bash: false
  edit: false
  write: false

prompt: |
  You are a senior institutional investment analyst. Your role is to:

  1. Analyze securities with professional rigor
  2. Consider risk-adjusted returns and portfolio context
  3. Apply fundamental, technical, and quantitative methods
  4. Communicate findings clearly with supporting data

  Always cite data sources and provide confidence levels for recommendations.
```

#### researcher.yaml
```yaml
name: researcher
description: Deep research and due diligence agent
mode: primary
useCase: stanley
color: "#7c3aed"

model: openrouter/anthropic/claude-sonnet-4
temperature: 0.4

tools:
  sec_filings: true
  earnings: true
  peer_comparison: true
  dcf: true
  news_sentiment: true

prompt: |
  You are a research analyst specializing in deep due diligence. Your focus:

  1. SEC filing analysis (10-K, 10-Q, 8-K, proxy statements)
  2. Earnings call transcript analysis
  3. Competitive positioning and peer comparison
  4. Management quality assessment
  5. Risk factor identification

  Provide thorough, citation-rich research reports.
```

#### quant.yaml
```yaml
name: quant
description: Quantitative analysis and backtesting agent
mode: primary
useCase: stanley
color: "#059669"

model: openrouter/anthropic/claude-sonnet-4
temperature: 0.2

tools:
  backtest: true
  factor_analysis: true
  risk_metrics: true
  statistical_tests: true

prompt: |
  You are a quantitative analyst. Your capabilities:

  1. Factor analysis and multi-factor models
  2. Statistical hypothesis testing
  3. Backtesting trading strategies
  4. Risk metrics (VaR, CVaR, Sharpe, Sortino)
  5. Portfolio optimization

  Always validate assumptions and report statistical significance.
```

#### macro.yaml
```yaml
name: macro
description: Macroeconomic analysis subagent
mode: subagent
useCase: stanley
color: "#dc2626"

tools:
  dbnomics: true
  regime_detection: true
  commodity_correlation: true
  yield_curve: true

prompt: |
  You are a macroeconomic analyst subagent. Provide:

  1. Economic indicator analysis
  2. Regime detection (expansion, contraction, crisis)
  3. Cross-asset correlation analysis
  4. Monetary policy impact assessment
  5. Commodity and currency dynamics
```

### Zee Personas

#### assistant.yaml
```yaml
name: assistant
description: Personal AI assistant with full context
mode: primary
useCase: zee
default: true
color: "#6366f1"

temperature: 0.7

identityFiles:
  - ~/clawd/IDENTITY.md
  - ~/clawd/SOUL.md

tools:
  memory: true
  calendar: true
  messaging: true
  web_search: true
  file_read: true

prompt: |
  # Loaded from IDENTITY.md and SOUL.md
  # This prompt is composed dynamically from identity files
```

#### coder.yaml
```yaml
name: coder
description: Technical help mode for coding assistance
mode: primary
useCase: zee
color: "#10b981"

extends: opencode/build

temperature: 0.3

prompt: |
  You are Zee in coder mode. Apply your personal context while focusing on:

  1. Writing clean, maintainable code
  2. Following project conventions
  3. Explaining technical decisions
  4. Helping debug issues
```

#### researcher.yaml
```yaml
name: researcher
description: Information gathering and research mode
mode: primary
useCase: zee
color: "#8b5cf6"

temperature: 0.5

tools:
  web_search: true
  web_fetch: true
  memory: true

prompt: |
  You are Zee in researcher mode. Focus on:

  1. Thorough information gathering
  2. Source verification
  3. Synthesizing findings
  4. Remembering key insights in memory
```

## Persona Loading

### Loading Order

1. **Built-in personas** from `src/agent/personas/`
2. **Global identity** from `~/clawd/` or `~/.agent-core/`
3. **Project personas** from `.agent-core/persona/`
4. **Config overrides** from `agent-core.json`
5. **Runtime overrides** from environment/flags

### Markdown Frontmatter Format

Personas can be defined as Markdown files with YAML frontmatter:

```markdown
---
name: custom-analyst
description: Custom analysis persona
mode: primary
extends: stanley/analyst
temperature: 0.4
tools:
  custom_tool: true
---

# Custom Analyst Persona

You are a specialized analyst with additional capabilities...

## Focus Areas

1. Emerging markets
2. ESG integration
3. Alternative data sources
```

### Identity/Soul Loading

The identity layer supports two formats:

#### Markdown Format (IDENTITY.md, SOUL.md)

```markdown
# IDENTITY.md - Who Am I?

- **Name:** Zee
- **Creature:** AI companion
- **Vibe:** Calm, direct, adaptive

---

## About Me

I'm Zee, a personal AI assistant...
```

#### YAML Format (identity.yaml, soul.yaml)

```yaml
name: Zee
creature: AI companion
vibe: Calm, direct, adaptive

about: |
  I'm Zee, a personal AI assistant...

values:
  - Directness
  - Privacy
  - Syntony
  - Competence
```

## API Design

### Agent Namespace

```typescript
export namespace Agent {
  // Get agent by name
  export async function get(name: string): Promise<AgentInfo | undefined>;

  // List all available agents
  export async function list(): Promise<AgentInfo[]>;

  // Get default agent
  export async function defaultAgent(): Promise<string>;

  // Generate agent from description
  export async function generate(input: {
    description: string;
    model?: ModelConfig;
  }): Promise<PersonaDefinition>;
}
```

### Persona Namespace

```typescript
export namespace Persona {
  // Load persona from file
  export async function load(path: string): Promise<PersonaDefinition>;

  // Load identity files
  export async function loadIdentity(config: PersonaConfig): Promise<{
    identity?: Identity;
    soul?: Soul;
  }>;

  // Resolve persona with inheritance
  export async function resolve(name: string): Promise<AgentInfo>;

  // Get active persona for session
  export async function active(sessionID: string): Promise<AgentInfo>;

  // Switch persona for session
  export async function switch(sessionID: string, persona: string): Promise<void>;
}
```

## Integration Points

### With Provider Module

```typescript
// Persona specifies model preference
const persona = await Persona.resolve('stanley/analyst');
const model = await Provider.getModel(
  persona.model.providerID,
  persona.model.modelID
);
```

### With Session Module

```typescript
// Session tracks active persona
interface Session {
  persona: string;
  // ...
}

// Persona switch triggers system prompt update
await Persona.switch(session.id, 'zee/coder');
```

### With Tool Module

```typescript
// Persona controls tool availability
const persona = await Persona.active(sessionID);
const tools = Tool.filter(allTools, persona.tools);
```

### With Memory Module

```typescript
// Identity loaded from memory/file system
const identity = await Persona.loadIdentity({
  identityPath: '~/clawd/IDENTITY.md',
  soulPath: '~/clawd/SOUL.md',
});
```

## Use Case Flows

### Stanley: Financial Analysis Session

```
1. User selects "analyst" persona
2. System loads stanley/analyst.yaml
3. System prompt emphasizes institutional rigor
4. Tools restricted to financial analysis
5. All bash/edit operations denied
6. Session maintains audit trail
```

### Zee: Personal Assistant Session

```
1. System loads ~/clawd/IDENTITY.md and SOUL.md
2. Zee persona merges with identity layer
3. Memory module provides conversation context
4. Messaging tools enabled for WhatsApp/Telegram
5. Privacy directives applied to all responses
```

### OpenCode: Development Session

```
1. User selects "build" or "plan" mode
2. System loads corresponding persona
3. Permission config controls file access
4. Tool whitelist/blacklist applied
5. Subagents spawned for parallel tasks
```

## Configuration Files

### agent-core.json

```json
{
  "persona": {
    "default": "zee/assistant",
    "identityPath": "~/clawd/IDENTITY.md",
    "soulPath": "~/clawd/SOUL.md",
    "personaDirs": [
      ".agent-core/persona",
      "~/.agent-core/persona"
    ]
  },
  "agent": {
    "stanley/analyst": {
      "model": "anthropic/claude-sonnet-4",
      "temperature": 0.3
    }
  }
}
```

## Security Considerations

1. **Permission Isolation**: Each persona has explicit permission boundaries
2. **Tool Restrictions**: Personas can blacklist dangerous tools
3. **Audit Trail**: All persona switches logged
4. **Identity Protection**: Soul.md privacy directives enforced
5. **External Access**: `external_directory` permission controls scope

## Migration Path

### From OpenCode

1. Existing `mode/*.md` files map to personas
2. `agent/*.md` files become custom personas
3. Permission config preserved
4. Tool config preserved

### From Zee

1. IDENTITY.md and SOUL.md become identity layer
2. Existing prompts become persona prompts
3. Memory integration preserved

---

*Document Version: 1.0*
*Created: 2026-01-04*
*Author: System Architecture Designer*

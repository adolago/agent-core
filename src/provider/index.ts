/**
 * Provider Module
 *
 * Multi-LLM provider system with subscription-based authentication support.
 */

export * from "./types";

// Re-export common provider IDs
export const ANTHROPIC = "anthropic";
export const OPENAI = "openai";
export const GOOGLE = "google";
export const MISTRAL = "mistral";
export const GROQ = "groq";
export const TOGETHER = "together";
export const DEEPSEEK = "deepseek";
export const XAI = "xai";
export const GITHUB_COPILOT = "github-copilot";

// Subscription providers
export const CLAUDE_MAX = "claude-max";
export const CHATGPT_PLUS = "chatgpt-plus";

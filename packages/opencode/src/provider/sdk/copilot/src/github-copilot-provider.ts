import type { EmbeddingModelV2, ImageModelV2, LanguageModelV2 } from "@ai-sdk/provider"
import { OpenAICompatibleChatLanguageModel } from "@ai-sdk/openai-compatible"
import { type FetchFunction, withoutTrailingSlash, withUserAgentSuffix } from "@ai-sdk/provider-utils"
import { type GitHubCopilotModelId } from "./github-copilot-chat-settings"
import { OpenAIResponsesLanguageModel } from "./responses/openai-responses-language-model"

// Import the version or define it
const VERSION = "0.1.0"

export interface GitHubCopilotProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string

  /**
   * Base URL for the GitHub Copilot API calls.
   */
  baseURL?: string

  /**
   * Name of the provider.
   */
  name?: string

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>

  /**
   * Custom fetch implementation.
   */
  fetch?: FetchFunction
}

export interface GitHubCopilotProvider {
  (modelId: GitHubCopilotModelId): LanguageModelV2
  chat(modelId: GitHubCopilotModelId): LanguageModelV2
  responses(modelId: GitHubCopilotModelId): LanguageModelV2
  languageModel(modelId: GitHubCopilotModelId): LanguageModelV2

  // embeddingModel(modelId: any): EmbeddingModelV2

  // imageModel(modelId: any): ImageModelV2
}

/**
 * Create a GitHub Copilot provider instance.
 */
export function createGitHubCopilotOpenAICompatible(
  options: GitHubCopilotProviderSettings = {},
): GitHubCopilotProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? "https://api.githubcopilot.com")

  if (!baseURL) {
    throw new Error("baseURL is required")
  }

  // Merge headers: defaults first, then user overrides
  const headers = {
    // Default GitHub Copilot headers (can be overridden by user)
    ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    ...options.headers,
  }

  const getHeaders = () => withUserAgentSuffix(headers, `ai-sdk/openai-compatible/${VERSION}`)

  const createChatModel = (modelId: GitHubCopilotModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `${options.name ?? "githubcopilot"}.chat`,
      headers: getHeaders,
      url: ({ path }) => `${baseURL}${path}`,
      fetch: options.fetch,
    })
  }

  const createResponsesModel = (modelId: GitHubCopilotModelId) => {
    return new OpenAIResponsesLanguageModel(modelId, {
      provider: `${options.name ?? "githubcopilot"}.responses`,
      headers: getHeaders,
      url: ({ path }) => `${baseURL}${path}`,
      fetch: options.fetch,
    })
  }

  const createLanguageModel = (modelId: GitHubCopilotModelId) => createChatModel(modelId)

  const provider = function (modelId: GitHubCopilotModelId) {
    return createChatModel(modelId)
  }

  provider.languageModel = createLanguageModel
  provider.chat = createChatModel
  provider.responses = createResponsesModel

  return provider as GitHubCopilotProvider
}

// Default GitHub Copilot provider instance
export const githubCopilot = createGitHubCopilotOpenAICompatible()

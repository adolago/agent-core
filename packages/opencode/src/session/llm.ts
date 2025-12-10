import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import { streamText, wrapLanguageModel, type ModelMessage, type StreamTextResult, type Tool, type ToolSet } from "ai"
import { mergeDeep, pipe } from "remeda"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import { Instance } from "@/project/instance"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "./message-v2"
import { Plugin } from "@/plugin"

export namespace LLM {
  const log = Log.create({ service: "llm" })

  export const OUTPUT_TOKEN_MAX = 32_000

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    model: Provider.Model
    agent: Agent.Info
    system: string[]
    abort: AbortSignal
    messages: ModelMessage[]
    tools: Record<string, Tool>
    retries?: number
  }

  export type StreamOutput = StreamTextResult<ToolSet, unknown>

  export async function stream(input: StreamInput) {
    const [language, cfg] = await Promise.all([Provider.getLanguage(input.model), Config.get()])

    const [first, ...rest] = input.system
    const system = [first, rest.join("\n")]

    const params = await Plugin.trigger(
      "chat.params",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        provider: Provider.getProvider(input.model.providerID),
        message: input.user,
      },
      {
        temperature: input.model.capabilities.temperature
          ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
          : undefined,
        topP: input.agent.topP ?? ProviderTransform.topP(input.model),
        options: pipe(
          ProviderTransform.options(input.model, input.sessionID),
          mergeDeep(input.model.options),
          mergeDeep(input.agent.options),
        ),
      },
    )

    const maxOutputTokens = ProviderTransform.maxOutputTokens(
      input.model.api.npm,
      params.options,
      input.model.limit.output,
      OUTPUT_TOKEN_MAX,
    )

    return streamText({
      onError(error) {
        log.error("stream error", {
          error,
        })
      },
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase()
        if (lower !== failed.toolCall.toolName && input.tools[lower]) {
          log.info("repairing tool call", {
            tool: failed.toolCall.toolName,
            repaired: lower,
          })
          return {
            ...failed.toolCall,
            toolName: lower,
          }
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        }
      },
      temperature: params.temperature,
      topP: params.topP,
      providerOptions: ProviderTransform.providerOptions(input.model, params.options, input.messages),
      activeTools: Object.keys(input.tools).filter((x) => x !== "invalid"),
      maxOutputTokens,
      abortSignal: input.abort,
      headers: {
        ...(input.model.providerID.startsWith("opencode")
          ? {
              "x-opencode-project": Instance.project.id,
              "x-opencode-session": input.sessionID,
              "x-opencode-request": input.user.id,
            }
          : undefined),
        ...input.model.headers,
      },
      maxRetries: input.retries ?? 0,
      messages: [
        ...system.map(
          (x): ModelMessage => ({
            role: "system",
            content: x,
          }),
        ),
        ...input.messages,
      ],
      model: wrapLanguageModel({
        model: language,
        middleware: [
          {
            async transformParams(args) {
              if (args.type === "stream") {
                // @ts-expect-error
                args.params.prompt = ProviderTransform.message(args.params.prompt, input.model)
              }
              return args.params
            },
          },
        ],
      }),
      experimental_telemetry: { isEnabled: cfg.experimental?.openTelemetry },
    })
  }
}

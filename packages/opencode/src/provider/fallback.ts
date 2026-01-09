import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config/config"
import { LLM } from "@/session/llm"
import { Provider } from "./provider"
import { CircuitBreaker } from "./circuit-breaker"
import { FallbackChain } from "./fallback-chain"
import { ModelEquivalence } from "./equivalence"
import z from "zod"

/**
 * Fallback Orchestrator - Main entry point for LLM streaming with automatic fallback.
 *
 * Wraps LLM.stream() to provide:
 * - Circuit breaker protection for unhealthy providers
 * - Automatic fallback to equivalent models on failure
 * - Configurable fallback rules based on error types
 * - Event emission for UI notifications
 */
export namespace Fallback {
  const log = Log.create({ service: "fallback" })

  // Events
  export const Event = {
    FallbackUsed: BusEvent.define(
      "fallback.used",
      z.object({
        sessionID: z.string(),
        originalProvider: z.string(),
        originalModel: z.string(),
        fallbackProvider: z.string(),
        fallbackModel: z.string(),
        reason: z.string(),
        attempt: z.number(),
      }),
    ),
    AllFallbacksExhausted: BusEvent.define(
      "fallback.exhausted",
      z.object({
        sessionID: z.string(),
        originalProvider: z.string(),
        originalModel: z.string(),
        attempted: z.array(z.string()),
        lastError: z.string(),
      }),
    ),
  }

  /**
   * Extended stream input with fallback configuration.
   */
  export type StreamInput = LLM.StreamInput & {
    /** Override default fallback config */
    fallbackConfig?: Partial<FallbackChain.Config>
    /** Skip fallback for this request */
    skipFallback?: boolean
  }

  /**
   * Stream with automatic fallback support.
   *
   * This is the main entry point - use this instead of LLM.stream() directly.
   */
  export async function stream(input: StreamInput): Promise<LLM.StreamOutput> {
    // Get fallback configuration
    const cfg = await Config.get()
    const fallbackConfig = FallbackChain.mergeConfig({
      ...cfg.fallback,
      ...input.fallbackConfig,
    })

    // Skip fallback if disabled or explicitly requested
    if (!fallbackConfig.enabled || input.skipFallback) {
      log.info("fallback disabled, using direct stream", {
        enabled: fallbackConfig.enabled,
        skipFallback: input.skipFallback,
      })
      return LLM.stream(input)
    }

    // Configure circuit breaker from config
    if (cfg.fallback?.circuitBreaker) {
      CircuitBreaker.configure(cfg.fallback.circuitBreaker)
    }

    const originalModel = `${input.model.providerID}/${input.model.id}`
    const attempted: string[] = []
    let currentModel = input.model
    let lastError: Error | undefined

    for (let attempt = 0; attempt < fallbackConfig.maxAttempts; attempt++) {
      const modelKey = `${currentModel.providerID}/${currentModel.id}`

      log.info("attempting stream", {
        attempt,
        provider: currentModel.providerID,
        model: currentModel.id,
        originalModel,
      })

      // Check circuit breaker before attempting
      if (!CircuitBreaker.canUse(currentModel.providerID)) {
        log.warn("circuit breaker open", { provider: currentModel.providerID })

        const fallbackModel = await FallbackChain.resolve(
          modelKey,
          new Error("circuit_open"),
          attempted,
          fallbackConfig,
        )

        if (fallbackModel) {
          const { providerID, modelID } = ModelEquivalence.parseModel(fallbackModel)
          try {
            currentModel = await Provider.getModel(providerID, modelID)
            continue
          } catch (e) {
            log.error("failed to get fallback model", { fallbackModel, error: e })
          }
        }

        // No fallback available for circuit-open provider
        throw new Error(`Provider ${currentModel.providerID} is unavailable (circuit breaker open)`)
      }

      // Track half-open requests
      const state = CircuitBreaker.getState(currentModel.providerID)
      if (state.state === "half_open") {
        CircuitBreaker.startHalfOpenRequest(currentModel.providerID)
      }

      attempted.push(modelKey)

      try {
        // Attempt the stream
        const result = await LLM.stream({
          ...input,
          model: currentModel,
        })

        // Success - record it and emit event if fallback was used
        CircuitBreaker.recordSuccess(currentModel.providerID)

        if (attempt > 0 && fallbackConfig.notifyOnFallback) {
          Bus.publish(Event.FallbackUsed, {
            sessionID: input.sessionID,
            originalProvider: input.model.providerID,
            originalModel: input.model.id,
            fallbackProvider: currentModel.providerID,
            fallbackModel: currentModel.id,
            reason: lastError?.message ?? "unknown",
            attempt,
          })
        }

        return result
      } catch (error) {
        lastError = error as Error
        CircuitBreaker.recordFailure(currentModel.providerID, lastError)

        log.warn("stream failed", {
          attempt,
          provider: currentModel.providerID,
          model: currentModel.id,
          error: lastError.message,
        })

        // Find fallback
        const fallbackModel = await FallbackChain.resolve(modelKey, lastError, attempted, fallbackConfig)

        if (!fallbackModel) {
          log.error("no fallback available", {
            originalModel,
            attempted,
            error: lastError.message,
          })
          break
        }

        // Switch to fallback model
        const { providerID, modelID } = ModelEquivalence.parseModel(fallbackModel)
        try {
          currentModel = await Provider.getModel(providerID, modelID)
          log.info("switching to fallback", {
            from: modelKey,
            to: fallbackModel,
          })
        } catch (e) {
          log.error("failed to get fallback model", { fallbackModel, error: e })
          break
        }
      }
    }

    // All fallbacks exhausted
    Bus.publish(Event.AllFallbacksExhausted, {
      sessionID: input.sessionID,
      originalProvider: input.model.providerID,
      originalModel: input.model.id,
      attempted,
      lastError: lastError?.message ?? "unknown",
    })

    throw lastError ?? new Error("All fallbacks exhausted")
  }

  /**
   * Check if fallback is available for the current configuration.
   */
  export async function isEnabled(): Promise<boolean> {
    const cfg = await Config.get()
    return cfg.fallback?.enabled ?? FallbackChain.DEFAULT_CONFIG.enabled
  }

  /**
   * Get the current fallback configuration.
   */
  export async function getConfig(): Promise<FallbackChain.Config> {
    const cfg = await Config.get()
    return FallbackChain.mergeConfig(cfg.fallback)
  }

  /**
   * Get circuit breaker states for all providers.
   */
  export function getCircuitBreakerStates(): Record<string, CircuitBreaker.ProviderState> {
    return CircuitBreaker.getAllStates()
  }

  /**
   * Reset circuit breaker for a specific provider.
   */
  export function resetCircuitBreaker(providerID: string): void {
    CircuitBreaker.reset(providerID)
  }

  /**
   * Reset all circuit breakers.
   */
  export function resetAllCircuitBreakers(): void {
    CircuitBreaker.resetAll()
  }
}

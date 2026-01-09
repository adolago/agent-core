import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { z } from "zod"

/**
 * Circuit Breaker pattern for provider health management.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Provider is failing, requests are blocked
 * - HALF_OPEN: Testing if provider has recovered
 *
 * Adapted from tiara's circuit-breaker.ts but standalone for agent-core.
 */
export namespace CircuitBreaker {
  const log = Log.create({ service: "circuit-breaker" })

  export type State = "closed" | "open" | "half_open"

  export type Config = {
    /** Number of consecutive failures before opening the circuit (default: 3) */
    failureThreshold: number
    /** Number of consecutive successes in half_open to close the circuit (default: 2) */
    successThreshold: number
    /** Time in ms before transitioning from open to half_open (default: 60000) */
    timeout: number
    /** Max concurrent requests in half_open state (default: 1) */
    halfOpenLimit: number
  }

  export type ProviderState = {
    state: State
    failures: number
    successes: number
    lastFailure?: number
    lastError?: string
    halfOpenRequests: number
  }

  // Events
  export const Event = {
    StateChanged: BusEvent.define(
      "circuit-breaker.state-changed",
      z.object({
        providerID: z.string(),
        previousState: z.enum(["closed", "open", "half_open"]),
        newState: z.enum(["closed", "open", "half_open"]),
        reason: z.string(),
      }),
    ),
  }

  // Default configuration
  const DEFAULT_CONFIG: Config = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60_000,
    halfOpenLimit: 1,
  }

  // In-memory state (resets on restart)
  const breakers = new Map<string, ProviderState>()
  let config: Config = { ...DEFAULT_CONFIG }

  /**
   * Configure circuit breaker settings.
   */
  export function configure(newConfig: Partial<Config>): void {
    config = { ...DEFAULT_CONFIG, ...newConfig }
    log.info("configured", { config })
  }

  /**
   * Get the current configuration.
   */
  export function getConfig(): Config {
    return { ...config }
  }

  /**
   * Get or initialize state for a provider.
   */
  function getOrCreateState(providerID: string): ProviderState {
    let state = breakers.get(providerID)
    if (!state) {
      state = {
        state: "closed",
        failures: 0,
        successes: 0,
        halfOpenRequests: 0,
      }
      breakers.set(providerID, state)
    }
    return state
  }

  /**
   * Check if a provider can accept requests.
   *
   * @returns true if requests should be allowed, false if circuit is open
   */
  export function canUse(providerID: string): boolean {
    const state = getOrCreateState(providerID)

    switch (state.state) {
      case "closed":
        return true

      case "open": {
        // Check if timeout has passed to transition to half_open
        if (state.lastFailure && Date.now() - state.lastFailure >= config.timeout) {
          transitionTo(providerID, state, "half_open", "timeout expired")
          return state.halfOpenRequests < config.halfOpenLimit
        }
        return false
      }

      case "half_open":
        // Allow limited requests in half_open
        return state.halfOpenRequests < config.halfOpenLimit
    }
  }

  /**
   * Record a successful request to a provider.
   */
  export function recordSuccess(providerID: string): void {
    const state = getOrCreateState(providerID)

    switch (state.state) {
      case "closed":
        // Reset failure count on success
        state.failures = 0
        break

      case "half_open":
        state.halfOpenRequests = Math.max(0, state.halfOpenRequests - 1)
        state.successes++

        if (state.successes >= config.successThreshold) {
          transitionTo(providerID, state, "closed", "success threshold reached")
        }
        break

      case "open":
        // Shouldn't happen, but handle gracefully
        log.warn("success recorded in open state", { providerID })
        break
    }

    log.info("success", {
      providerID,
      state: state.state,
      successes: state.successes,
      failures: state.failures,
    })
  }

  /**
   * Record a failed request to a provider.
   */
  export function recordFailure(providerID: string, error: Error): void {
    const state = getOrCreateState(providerID)
    state.lastFailure = Date.now()
    state.lastError = error.message

    switch (state.state) {
      case "closed":
        state.failures++

        if (state.failures >= config.failureThreshold) {
          transitionTo(providerID, state, "open", `failure threshold reached: ${error.message}`)
        }
        break

      case "half_open":
        state.halfOpenRequests = Math.max(0, state.halfOpenRequests - 1)
        // Any failure in half_open immediately opens the circuit
        transitionTo(providerID, state, "open", `failure in half_open: ${error.message}`)
        break

      case "open":
        // Already open, just update failure info
        state.failures++
        break
    }

    log.info("failure", {
      providerID,
      state: state.state,
      failures: state.failures,
      error: error.message,
    })
  }

  /**
   * Increment half-open request counter when starting a request.
   */
  export function startHalfOpenRequest(providerID: string): void {
    const state = getOrCreateState(providerID)
    if (state.state === "half_open") {
      state.halfOpenRequests++
    }
  }

  /**
   * Transition to a new state.
   */
  function transitionTo(providerID: string, state: ProviderState, newState: State, reason: string): void {
    const previousState = state.state
    state.state = newState

    // Reset counters on transition
    if (newState === "closed") {
      state.failures = 0
      state.successes = 0
      state.halfOpenRequests = 0
    } else if (newState === "half_open") {
      state.successes = 0
      state.halfOpenRequests = 0
    } else if (newState === "open") {
      state.successes = 0
      state.halfOpenRequests = 0
    }

    log.info("state transition", {
      providerID,
      previousState,
      newState,
      reason,
    })

    Bus.publish(Event.StateChanged, {
      providerID,
      previousState,
      newState,
      reason,
    })
  }

  /**
   * Get the current state for a provider.
   */
  export function getState(providerID: string): ProviderState {
    return { ...getOrCreateState(providerID) }
  }

  /**
   * Get all provider states.
   */
  export function getAllStates(): Record<string, ProviderState> {
    const result: Record<string, ProviderState> = {}
    for (const [id, state] of breakers) {
      result[id] = { ...state }
    }
    return result
  }

  /**
   * Reset state for a specific provider.
   */
  export function reset(providerID: string): void {
    breakers.delete(providerID)
    log.info("reset", { providerID })
  }

  /**
   * Reset all circuit breakers.
   */
  export function resetAll(): void {
    breakers.clear()
    log.info("reset all")
  }

  /**
   * Force a provider into a specific state (for testing/admin).
   */
  export function forceState(providerID: string, newState: State): void {
    const state = getOrCreateState(providerID)
    transitionTo(providerID, state, newState, "forced by admin")
  }
}

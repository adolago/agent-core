import { spawn } from "node:child_process"

export type ServerOptions = {
  hostname?: string
  port?: number
  signal?: AbortSignal
  timeout?: number
  config?: Record<string, unknown>
}

export type TuiOptions = {
  project?: string
  model?: string
  session?: string
  agent?: string
  signal?: AbortSignal
  config?: Record<string, unknown>
}

/**
 * Creates and starts an Agent Core daemon server
 * @param options Server configuration options
 * @returns Server instance with url and close method
 */
export async function createAgentCoreServer(options?: ServerOptions) {
  const opts = {
    hostname: "127.0.0.1",
    port: 3210,
    timeout: 5000,
    ...options,
  }

  const args = [`serve`, `--hostname=${opts.hostname}`, `--port=${opts.port}`]
  if (opts.config?.logLevel) args.push(`--log-level=${opts.config.logLevel}`)

  const proc = spawn(`agent-core`, args, {
    signal: opts.signal,
    env: {
      ...process.env,
      AGENT_CORE_CONFIG_CONTENT: JSON.stringify(opts.config ?? {}),
    },
  })

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`Timeout waiting for server to start after ${opts.timeout}ms`))
    }, opts.timeout)

    let output = ""

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.startsWith("agent-core server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (!match) {
            throw new Error(`Failed to parse server url from output: ${line}`)
          }
          clearTimeout(id)
          resolve(match[1]!)
          return
        }
      }
    })

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
    })

    proc.on("exit", (code) => {
      clearTimeout(id)
      let msg = `Server exited with code ${code}`
      if (output.trim()) {
        msg += `\nServer output: ${output}`
      }
      reject(new Error(msg))
    })

    proc.on("error", (error) => {
      clearTimeout(id)
      reject(error)
    })

    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        clearTimeout(id)
        reject(new Error("Aborted"))
      })
    }
  })

  return {
    url,
    close() {
      proc.kill()
    },
  }
}

/** @deprecated Use createAgentCoreServer instead */
export const createOpencodeServer = createAgentCoreServer

/**
 * Creates and launches the Agent Core TUI
 * @param options TUI configuration options
 * @returns TUI instance with close method
 */
export function createAgentCoreTui(options?: TuiOptions) {
  const args: string[] = []

  if (options?.project) {
    args.push(`--project=${options.project}`)
  }
  if (options?.model) {
    args.push(`--model=${options.model}`)
  }
  if (options?.session) {
    args.push(`--session=${options.session}`)
  }
  if (options?.agent) {
    args.push(`--agent=${options.agent}`)
  }

  const proc = spawn(`agent-core`, args, {
    signal: options?.signal,
    stdio: "inherit",
    env: {
      ...process.env,
      AGENT_CORE_CONFIG_CONTENT: JSON.stringify(options?.config ?? {}),
    },
  })

  return {
    close() {
      proc.kill()
    },
  }
}

/** @deprecated Use createAgentCoreTui instead */
export const createOpencodeTui = createAgentCoreTui

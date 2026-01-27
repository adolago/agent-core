import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { Installation } from "@/installation"
import os from "os"
import path from "path"
import { Global } from "@/global"
import { randomUUID } from "crypto"

// Kimi For Coding OAuth configuration (from Kimi CLI source)
const KIMI_CODE_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098"
const OAUTH_HOST = "https://auth.kimi.com"
const API_BASE_URL = "https://api.kimi.com/coding/v1"

// Polling configuration
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

// Device ID persistence
const DEVICE_ID_FILE = "kimi-device-id"

async function getDeviceId(): Promise<string> {
  const filepath = path.join(Global.Path.data, DEVICE_ID_FILE)
  try {
    const file = Bun.file(filepath)
    const existing = await file.text()
    if (existing && existing.trim()) {
      return existing.trim()
    }
  } catch {
    // File doesn't exist, generate new ID
  }

  const deviceId = randomUUID().replace(/-/g, "")
  await Bun.write(filepath, deviceId)
  return deviceId
}

function getDeviceModel(): string {
  const platform = os.platform()
  const arch = os.arch()
  const release = os.release()

  if (platform === "darwin") {
    return `macOS ${release} ${arch}`
  }
  if (platform === "win32") {
    return `Windows ${release} ${arch}`
  }
  if (platform === "linux") {
    return `Linux ${release} ${arch}`
  }
  return `${platform} ${release} ${arch}`
}

async function getKimiHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId()
  const version = Installation.VERSION

  return {
    "User-Agent": `KimiCLI/${version}`,
    "X-Msh-Platform": "kimi_cli",
    "X-Msh-Version": version,
    "X-Msh-Device-Name": os.hostname(),
    "X-Msh-Device-Model": getDeviceModel(),
    "X-Msh-Os-Version": os.release(),
    "X-Msh-Device-Id": deviceId,
  }
}

export async function KimiAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "kimi-for-coding",
      async loader(getAuth, provider) {
        const info = await getAuth()
        if (!info || info.type !== "oauth") return {}

        // Set cost to 0 since it's free via Kimi For Coding
        if (provider && provider.models) {
          for (const model of Object.values(provider.models)) {
            model.cost = {
              input: 0,
              output: 0,
              cache: {
                read: 0,
                write: 0,
              },
            }
          }
        }

        return {
          baseURL: API_BASE_URL,
          apiKey: "",
          async fetch(request: RequestInfo | URL, init?: RequestInit) {
            const info = await getAuth()
            if (info.type !== "oauth") return fetch(request, init)

            const kimiHeaders = await getKimiHeaders()

            // Start with init headers, then override with Kimi headers
            const initHeaders = init?.headers as Record<string, string> || {}
            const headers: Record<string, string> = {}

            // Copy init headers, skipping user-agent variants
            for (const [key, value] of Object.entries(initHeaders)) {
              if (key.toLowerCase() !== "user-agent") {
                headers[key] = value
              }
            }

            // Add Kimi headers (these take precedence)
            Object.assign(headers, kimiHeaders)
            headers["Authorization"] = `Bearer ${info.access}`

            // Remove any conflicting auth headers
            delete headers["x-api-key"]
            delete headers["authorization"] // lowercase version

            return fetch(request, {
              ...init,
              headers,
            })
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with Kimi For Coding",
          async authorize() {
            const kimiHeaders = await getKimiHeaders()

            // Step 1: Request device authorization
            const deviceResponse = await fetch(`${OAUTH_HOST}/api/oauth/device_authorization`, {
              method: "POST",
              headers: {
                ...kimiHeaders,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                client_id: KIMI_CODE_CLIENT_ID,
              }),
            })

            if (!deviceResponse.ok) {
              const errorText = await deviceResponse.text()
              throw new Error(`Failed to initiate device authorization: ${errorText}`)
            }

            const deviceData = (await deviceResponse.json()) as {
              user_code: string
              device_code: string
              verification_uri: string
              verification_uri_complete: string
              expires_in: number
              interval: number
            }

            return {
              url: deviceData.verification_uri_complete,
              instructions: `Enter code: ${deviceData.user_code}`,
              method: "auto" as const,
              async callback() {
                const pollInterval = Math.max(deviceData.interval || 5, 1) * 1000

                while (true) {
                  const tokenResponse = await fetch(`${OAUTH_HOST}/api/oauth/token`, {
                    method: "POST",
                    headers: {
                      ...kimiHeaders,
                      "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                      client_id: KIMI_CODE_CLIENT_ID,
                      device_code: deviceData.device_code,
                      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                    }),
                  })

                  const data = (await tokenResponse.json()) as {
                    access_token?: string
                    refresh_token?: string
                    expires_in?: number
                    scope?: string
                    token_type?: string
                    error?: string
                    error_description?: string
                    interval?: number
                  }

                  if (tokenResponse.status === 200 && data.access_token) {
                    const expiresIn = data.expires_in || 3600
                    return {
                      type: "success" as const,
                      access: data.access_token,
                      refresh: data.refresh_token || data.access_token,
                      expires: Date.now() + expiresIn * 1000,
                    }
                  }

                  if (data.error === "authorization_pending") {
                    await Bun.sleep(pollInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                    continue
                  }

                  if (data.error === "slow_down") {
                    const newInterval = data.interval
                      ? data.interval * 1000
                      : pollInterval + 5000
                    await Bun.sleep(newInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                    continue
                  }

                  if (data.error === "expired_token") {
                    // Device code expired, need to restart flow
                    return { type: "failed" as const }
                  }

                  if (data.error) {
                    return { type: "failed" as const }
                  }

                  // Unknown state, continue polling
                  await Bun.sleep(pollInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                }
              },
            }
          },
        },
      ],
    },
  }
}

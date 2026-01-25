import { Flag } from "@/flag/flag"

const DEFAULT_USERNAME = "agent-core"

type AuthConfig = {
  disabled: boolean
  username: string
  password?: string
}

export function getAuthConfig(): AuthConfig {
  // Auth is disabled by default for personal use. Set AGENT_CORE_ENABLE_SERVER_AUTH=1 to enable.
  const explicitlyEnabled = Flag.AGENT_CORE_ENABLE_SERVER_AUTH || Flag.OPENCODE_ENABLE_SERVER_AUTH
  const explicitlyDisabled = Flag.AGENT_CORE_DISABLE_SERVER_AUTH || Flag.OPENCODE_DISABLE_SERVER_AUTH
  const disabled = !explicitlyEnabled || explicitlyDisabled
  const password = Flag.AGENT_CORE_SERVER_PASSWORD ?? Flag.OPENCODE_SERVER_PASSWORD
  const username = Flag.AGENT_CORE_SERVER_USERNAME ?? Flag.OPENCODE_SERVER_USERNAME ?? DEFAULT_USERNAME
  return { disabled, password, username }
}

export function getAuthorizationHeader(): string | undefined {
  const { disabled, password, username } = getAuthConfig()
  if (disabled || !password) return undefined
  const token = Buffer.from(`${username}:${password}`, "utf-8").toString("base64")
  return `Basic ${token}`
}

export function authorizeRequest(request: Request): Request {
  const auth = getAuthorizationHeader()
  if (auth && !request.headers.has("Authorization")) {
    request.headers.set("Authorization", auth)
  }
  return request
}

export function createAuthorizedFetch(fetchFn: typeof fetch): typeof fetch {
  const wrapped = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request && !init ? input : new Request(input, init)
    return fetchFn(authorizeRequest(request))
  }
  wrapped.preconnect = fetchFn.preconnect?.bind(fetchFn)
  return wrapped as typeof fetch
}

export function isAuthorized(authorizationHeader?: string): boolean {
  const { disabled, password, username: expectedUsername } = getAuthConfig()
  if (disabled) return true
  if (!password) return false
  if (!authorizationHeader) return false
  const match = authorizationHeader.trim().match(/^Basic\s+(.+)$/i)
  if (!match) return false
  let decoded: string
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf-8")
  } catch {
    return false
  }
  const separatorIndex = decoded.indexOf(":")
  if (separatorIndex < 0) return false
  const username = decoded.slice(0, separatorIndex)
  const providedPassword = decoded.slice(separatorIndex + 1)
  return secureEqual(username, expectedUsername) && secureEqual(providedPassword, password)
}

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

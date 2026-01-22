import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type {
  GatewayAuthConfig,
  GatewayTailscaleMode,
} from "../config/config.js";
export type ResolvedGatewayAuthMode = "none" | "token" | "password";

export type ResolvedGatewayAuth = {
  mode: ResolvedGatewayAuthMode;
  token?: string;
  password?: string;
  allowTailscale: boolean;
};

export type GatewayAuthResult = {
  ok: boolean;
  method?: "none" | "token" | "password" | "tailscale";
  user?: string;
  reason?: string;
};

type ConnectAuth = {
  token?: string;
  password?: string;
};

type TailscaleUser = {
  login: string;
  name: string;
  profilePic?: string;
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  if (ip === "127.0.0.1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip === "::1") return true;
  if (ip.startsWith("::ffff:127.")) return true;
  return false;
}

function isLocalDirectRequest(req?: IncomingMessage): boolean {
  if (!req) return false;
  const clientIp = req.socket?.remoteAddress ?? "";
  if (!isLoopbackAddress(clientIp)) return false;

  const host = (req.headers.host ?? "").toLowerCase();
  const hostIsLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");

  const hasForwarded = Boolean(
    req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-host"],
  );

  return hostIsLocal && !hasForwarded;
}

function getTailscaleUser(req?: IncomingMessage): TailscaleUser | null {
  if (!req) return null;
  const login = req.headers["tailscale-user-login"];
  if (typeof login !== "string" || !login.trim()) return null;
  const nameRaw = req.headers["tailscale-user-name"];
  const profilePic = req.headers["tailscale-user-profile-pic"];
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim()
      : login.trim();
  return {
    login: login.trim(),
    name,
    profilePic:
      typeof profilePic === "string" && profilePic.trim()
        ? profilePic.trim()
        : undefined,
  };
}

function hasTailscaleProxyHeaders(req?: IncomingMessage): boolean {
  if (!req) return false;
  return Boolean(
    req.headers["x-forwarded-for"] &&
      req.headers["x-forwarded-proto"] &&
      req.headers["x-forwarded-host"],
  );
}

function isTailscaleProxyRequest(req?: IncomingMessage): boolean {
  if (!req) return false;
  return (
    isLoopbackAddress(req.socket?.remoteAddress) &&
    hasTailscaleProxyHeaders(req)
  );
}

/** Valid Tailscale modes for the gateway */
const VALID_TAILSCALE_MODES = ["off", "funnel", "serve"] as const;

/**
 * Validate Tailscale mode configuration
 * @throws Error if mode is invalid
 */
function validateTailscaleMode(
  mode: unknown,
): GatewayTailscaleMode | undefined {
  if (mode === undefined || mode === null) return undefined;
  if (typeof mode !== "string") {
    throw new Error(`tailscaleMode must be a string, got ${typeof mode}`);
  }
  if (!VALID_TAILSCALE_MODES.includes(mode as GatewayTailscaleMode)) {
    throw new Error(
      `Invalid tailscaleMode: "${mode}". Must be one of: ${VALID_TAILSCALE_MODES.join(", ")}`,
    );
  }
  return mode as GatewayTailscaleMode;
}

/**
 * Validate auth mode configuration
 * @throws Error if mode is invalid
 */
function validateAuthMode(mode: unknown): ResolvedGatewayAuthMode | undefined {
  if (mode === undefined || mode === null) return undefined;
  if (typeof mode !== "string") {
    throw new Error(`auth mode must be a string, got ${typeof mode}`);
  }
  const validModes: ResolvedGatewayAuthMode[] = ["none", "token", "password"];
  if (!validModes.includes(mode as ResolvedGatewayAuthMode)) {
    throw new Error(
      `Invalid auth mode: "${mode}". Must be one of: ${validModes.join(", ")}`,
    );
  }
  return mode as ResolvedGatewayAuthMode;
}

export function resolveGatewayAuth(params: {
  authConfig?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
  tailscaleMode?: GatewayTailscaleMode;
}): ResolvedGatewayAuth {
  const authConfig = params.authConfig ?? {};
  const env = params.env ?? process.env;

  // Validate tailscale mode if provided
  const validatedTailscaleMode = validateTailscaleMode(params.tailscaleMode);

  // Validate auth mode if explicitly configured
  const configuredMode = validateAuthMode(authConfig.mode);

  const token = authConfig.token ?? env.ZEE_GATEWAY_TOKEN ?? undefined;
  const password = authConfig.password ?? env.ZEE_GATEWAY_PASSWORD ?? undefined;
  const mode: ResolvedGatewayAuth["mode"] =
    configuredMode ?? (password ? "password" : token ? "token" : "none");

  // Validate security: warn if Tailscale is enabled without proper auth in serve mode
  const allowTailscale =
    authConfig.allowTailscale ??
    (validatedTailscaleMode === "serve" && mode !== "password");

  // Security check: allowTailscale with mode "none" is risky if not on localhost
  if (
    allowTailscale &&
    mode === "none" &&
    validatedTailscaleMode === "funnel"
  ) {
    console.warn(
      "[gateway auth] WARNING: allowTailscale=true with mode=none and funnel mode " +
        "exposes the gateway to the internet without authentication. " +
        "Consider using token or password authentication.",
    );
  }

  return {
    mode,
    token,
    password,
    allowTailscale,
  };
}

export function assertGatewayAuthConfigured(auth: ResolvedGatewayAuth): void {
  if (auth.mode === "token" && !auth.token) {
    throw new Error(
      "gateway auth mode is token, but no token was configured (set gateway.auth.token or ZEE_GATEWAY_TOKEN)",
    );
  }
  if (auth.mode === "password" && !auth.password) {
    throw new Error(
      "gateway auth mode is password, but no password was configured",
    );
  }
}

export async function authorizeGatewayConnect(params: {
  auth: ResolvedGatewayAuth;
  connectAuth?: ConnectAuth | null;
  req?: IncomingMessage;
}): Promise<GatewayAuthResult> {
  const { auth, connectAuth, req } = params;
  const localDirect = isLocalDirectRequest(req);

  if (auth.mode === "none") {
    if (auth.allowTailscale && !localDirect) {
      const tailscaleUser = getTailscaleUser(req);
      if (!tailscaleUser) {
        return { ok: false, reason: "unauthorized" };
      }
      if (!isTailscaleProxyRequest(req)) {
        return { ok: false, reason: "unauthorized" };
      }
      return {
        ok: true,
        method: "tailscale",
        user: tailscaleUser.login,
      };
    }
    return { ok: true, method: "none" };
  }

  if (auth.mode === "token") {
    if (auth.token && connectAuth?.token === auth.token) {
      return { ok: true, method: "token" };
    }
  }

  if (auth.mode === "password") {
    const password = connectAuth?.password;
    if (!password || !auth.password) {
      return { ok: false, reason: "unauthorized" };
    }
    if (!safeEqual(password, auth.password)) {
      return { ok: false, reason: "unauthorized" };
    }
    return { ok: true, method: "password" };
  }

  if (auth.allowTailscale) {
    const tailscaleUser = getTailscaleUser(req);
    if (tailscaleUser && isTailscaleProxyRequest(req)) {
      return {
        ok: true,
        method: "tailscale",
        user: tailscaleUser.login,
      };
    }
  }

  return { ok: false, reason: "unauthorized" };
}

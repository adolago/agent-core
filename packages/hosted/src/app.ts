import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { getCookie } from "hono/cookie"
import { z } from "zod"
import { createHash, randomBytes, randomUUID } from "crypto"
import { env } from "./env"
import { db, initDb } from "./db"
import {
  clearSessionCookie,
  createSession,
  getUserByEmail,
  getUserById,
  getUserFromSession,
  hashPassword,
  requireApiAuth,
  requireConsoleAuth,
  setSessionCookie,
  verifyPassword,
} from "./auth"
import { checkRateLimit } from "./rate-limit"
import { decryptJson, encryptJson, safeCompare } from "./crypto"

initDb()

const app = new Hono()
app.use("*", logger())
app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : "*",
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Workspace-Key"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
)

const emailSchema = z.string().min(3).email()
const passwordSchema = z.string().min(8)

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

const jsonResponse = <T>(c: any, data: T, status = 200) => c.json(data, status)

const now = () => Date.now()

const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex")

const getClientIp = (c: any) => {
  const forwarded = c.req.header("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return c.req.header("x-real-ip") ?? "unknown"
}

const getSetting = (key: string, fallback: string) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

const setSetting = (key: string, value: string) => {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  )
}

const parseSettingNumber = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const applyRetention = () => {
  const retentionLogs = parseSettingNumber(
    getSetting("retention_logs_days", String(env.RETENTION_LOGS_DAYS)),
    env.RETENTION_LOGS_DAYS,
  )
  const retentionTelemetry = parseSettingNumber(
    getSetting("retention_telemetry_days", String(env.RETENTION_TELEMETRY_DAYS)),
    env.RETENTION_TELEMETRY_DAYS,
  )
  const retentionUsage = parseSettingNumber(
    getSetting("retention_usage_days", String(env.RETENTION_USAGE_DAYS)),
    env.RETENTION_USAGE_DAYS,
  )
  const nowMs = now()
  db.prepare("DELETE FROM log_events WHERE created_at < ?")
    .run(nowMs - retentionLogs * 24 * 60 * 60 * 1000)
  db.prepare("DELETE FROM telemetry_events WHERE created_at < ?")
    .run(nowMs - retentionTelemetry * 24 * 60 * 60 * 1000)
  db.prepare("DELETE FROM usage_events WHERE created_at < ?")
    .run(nowMs - retentionUsage * 24 * 60 * 60 * 1000)
}

const recordBillingEvent = (workspaceId: string, event: string, metadata: Record<string, any> = {}) => {
  db.prepare(
    "INSERT INTO billing_events (id, workspace_id, event, amount, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, event, null, JSON.stringify(metadata), now())
}

const ensureBootstrapUser = () => {
  const email = process.env.HOSTED_BOOTSTRAP_EMAIL
  const password = process.env.HOSTED_BOOTSTRAP_PASSWORD
  if (!email || !password) return
  const count = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }
  if (count.count > 0) return
  const userId = randomUUID()
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, email, hashPassword(password), now())
  const orgId = randomUUID()
  db.prepare("INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, "Default", userId, now())
  db.prepare("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, userId, "owner", now())
  const workspaceId = randomUUID()
  db.prepare(
    "INSERT INTO workspaces (id, org_id, name, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(workspaceId, orgId, "Default", env.DEFAULT_PLAN, "active", now())
  db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(workspaceId, userId, "owner", now())
}

ensureBootstrapUser()

const hasOrgAccess = (userId: string, orgId: string) => {
  const row = db
    .prepare("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?")
    .get(orgId, userId) as { 1: number } | undefined
  return Boolean(row)
}

const hasWorkspaceAccess = (userId: string, workspaceId: string) => {
  const row = db
    .prepare("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId) as { 1: number } | undefined
  return Boolean(row)
}

const getWorkspaceById = (workspaceId: string) =>
  db
    .prepare(
      "SELECT id, org_id, name, plan, status, billing_customer_id, billing_portal_url, usage_cap_requests, usage_cap_tokens FROM workspaces WHERE id = ?",
    )
    .get(workspaceId) as
    | {
        id: string
        org_id: string
        name: string
        plan: string
        status: string
        billing_customer_id: string | null
        billing_portal_url: string | null
        usage_cap_requests: number | null
        usage_cap_tokens: number | null
      }
    | undefined

const planCatalog = {
  free: { id: "free", name: "Free", requestCap: 2000, tokenCap: 250000 },
  pro: { id: "pro", name: "Pro", requestCap: 100000, tokenCap: 20000000 },
  enterprise: { id: "enterprise", name: "Enterprise", requestCap: null, tokenCap: null },
}

const getPlan = (planId: string) => planCatalog[planId as keyof typeof planCatalog] ?? planCatalog.free

const startOfMonth = () => {
  const date = new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

const usageSummary = (workspaceId: string) => {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(requests), 0) as requests, COALESCE(SUM(tokens), 0) as tokens FROM usage_events WHERE workspace_id = ? AND created_at >= ?",
    )
    .get(workspaceId, startOfMonth()) as { requests: number; tokens: number }
  return row
}

const generateShareSlug = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const size = 10
  let output = ""
  for (let i = 0; i < size; i += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return output
}

const requireShareAuth = (c: any) => {
  const provided = (c.req.header("x-api-key") || c.req.header("authorization")?.replace("Bearer ", ""))?.trim()
  if (env.API_KEYS.length === 0) return { ok: true }
  if (!provided) return { ok: false, status: 401, message: "Missing API key" }
  const match = env.API_KEYS.find((key) => safeCompare(key, provided))
  if (!match) return { ok: false, status: 403, message: "Invalid API key" }
  return { ok: true, key: provided }
}

const getWorkspaceKey = (c: any) => {
  const provided = c.req.header("x-workspace-key") || c.req.header("authorization")?.replace("Bearer ", "")
  return provided?.trim()
}

const validateWorkspaceKey = (workspaceId: string, key: string | undefined) => {
  if (!key) return false
  const hash = hashApiKey(key)
  const row = db
    .prepare("SELECT id FROM workspace_api_keys WHERE workspace_id = ? AND key_hash = ?")
    .get(workspaceId, hash) as { id: string } | undefined
  if (row) {
    db.prepare("UPDATE workspace_api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id)
    return true
  }
  return false
}

const getOauthConfig = (providerId: string) => {
  const key = providerId.toUpperCase().replace(/[^A-Z0-9]/g, \"_\")
  const prefix = `HOSTED_OAUTH_${key}_`
  const authorizeUrl = process.env[`${prefix}AUTHORIZE_URL`]
  const tokenUrl = process.env[`${prefix}TOKEN_URL`]
  const clientId = process.env[`${prefix}CLIENT_ID`]
  const clientSecret = process.env[`${prefix}CLIENT_SECRET`]
  const scopes = process.env[`${prefix}SCOPES`] ?? \"\"
  const baseUrl = process.env[`${prefix}BASE_URL`] ?? \"https://api.openai.com\"
  if (!authorizeUrl || !clientId) return null
  return { authorizeUrl, tokenUrl, clientId, clientSecret, scopes, baseUrl }
}

app.get("/", (c) => c.redirect("/console"))

app.get("/health", (c) => c.json({ ok: true }))

app.get("/console/login", (c) => {
  const allowSignup = env.ALLOW_SIGNUP
  const error = c.req.query("error")
  const nextUrl = c.req.query("next") ?? "/console"
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent-Core Hosted Console</title>
  <style>
    body { font-family: "IBM Plex Sans", "Space Grotesk", sans-serif; background: #f4f3ef; margin: 0; padding: 32px; color: #2a2520; }
    .card { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 12px 30px rgba(25,18,10,0.12); border: 1px solid #e0d8cd; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    label { display: block; font-size: 13px; margin-top: 12px; color: #5b534a; }
    input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #cfc5b6; margin-top: 6px; }
    button { margin-top: 16px; width: 100%; padding: 10px 14px; border-radius: 10px; border: 0; background: #b4542a; color: #fff; font-weight: 600; }
    .error { color: #b23131; margin-top: 12px; }
    .link { margin-top: 12px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hosted console</h1>
    <p>Sign in to manage organizations, workspaces, and providers.</p>
    <form method="post" action="/console/login">
      <input type="hidden" name="next" value="${escapeHtml(nextUrl)}" />
      <label>Email</label>
      <input name="email" type="email" required />
      <label>Password</label>
      <input name="password" type="password" required />
      <button type="submit">Sign in</button>
    </form>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    ${allowSignup ? `<div class="link"><a href="/console/register">Create an account</a></div>` : ""}
  </div>
</body>
</html>`)
})

app.post("/console/login", async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email ?? "").trim().toLowerCase()
  const password = String(body.password ?? "")
  const nextUrl = String(body.next ?? "/console")
  const user = getUserByEmail(email)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return c.redirect(`/console/login?error=${encodeURIComponent("Invalid credentials")}`)
  }
  const sessionId = createSession(user.id)
  setSessionCookie(c, sessionId)
  return c.redirect(nextUrl)
})

app.get("/console/register", (c) => {
  if (!env.ALLOW_SIGNUP) return c.redirect("/console/login?error=Signups disabled")
  const error = c.req.query("error")
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Register</title>
  <style>
    body { font-family: "IBM Plex Sans", "Space Grotesk", sans-serif; background: #f4f3ef; margin: 0; padding: 32px; color: #2a2520; }
    .card { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 12px 30px rgba(25,18,10,0.12); border: 1px solid #e0d8cd; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    label { display: block; font-size: 13px; margin-top: 12px; color: #5b534a; }
    input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #cfc5b6; margin-top: 6px; }
    button { margin-top: 16px; width: 100%; padding: 10px 14px; border-radius: 10px; border: 0; background: #2b7c4d; color: #fff; font-weight: 600; }
    .error { color: #b23131; margin-top: 12px; }
    .link { margin-top: 12px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Create account</h1>
    <form method="post" action="/console/register">
      <label>Email</label>
      <input name="email" type="email" required />
      <label>Password</label>
      <input name="password" type="password" required />
      <button type="submit">Create account</button>
    </form>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <div class="link"><a href="/console/login">Back to sign in</a></div>
  </div>
</body>
</html>`)
})

app.post("/console/register", async (c) => {
  if (!env.ALLOW_SIGNUP) return c.redirect("/console/login?error=Signups disabled")
  const body = await c.req.parseBody()
  const email = String(body.email ?? "").trim().toLowerCase()
  const password = String(body.password ?? "")

  const parsedEmail = emailSchema.safeParse(email)
  const parsedPassword = passwordSchema.safeParse(password)
  if (!parsedEmail.success || !parsedPassword.success) {
    return c.redirect(`/console/register?error=${encodeURIComponent("Invalid email or password")}`)
  }

  if (getUserByEmail(email)) {
    return c.redirect(`/console/register?error=${encodeURIComponent("Email already registered")}`)
  }

  const userId = randomUUID()
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, email, hashPassword(password), now())

  const orgId = randomUUID()
  db.prepare("INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, `${email.split("@")[0]} org`, userId, now())
  db.prepare("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, userId, "owner", now())

  const workspaceId = randomUUID()
  db.prepare(
    "INSERT INTO workspaces (id, org_id, name, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(workspaceId, orgId, "Primary", env.DEFAULT_PLAN, "active", now())
  db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(workspaceId, userId, "owner", now())

  const sessionId = createSession(userId)
  setSessionCookie(c, sessionId)
  return c.redirect("/console")
})

app.post("/console/logout", requireConsoleAuth, (c) => {
  const sessionId = getCookie(c, "agent_core_hosted_session")
  if (sessionId) db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId)
  clearSessionCookie(c)
  return c.redirect("/console/login")
})

app.get("/console", requireConsoleAuth, (c) => {
  const user = c.get("user") as { id: string; email: string }

  const orgRows = db
    .prepare("SELECT id, name, owner_user_id FROM orgs WHERE id IN (SELECT org_id FROM org_members WHERE user_id = ?)")
    .all(user.id) as Array<{ id: string; name: string; owner_user_id: string }>

  const workspaces = db
    .prepare(
      "SELECT w.id, w.org_id, w.name, w.plan, w.status, w.usage_cap_requests, w.usage_cap_tokens FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = ?",
    )
    .all(user.id) as Array<{
    id: string
    org_id: string
    name: string
    plan: string
    status: string
    usage_cap_requests: number | null
    usage_cap_tokens: number | null
  }>

  const providers = db
    .prepare("SELECT id, workspace_id, provider_id, connection_type, created_at FROM provider_connections")
    .all() as Array<{ id: string; workspace_id: string; provider_id: string; connection_type: string; created_at: number }>

  const apiKeys = db
    .prepare("SELECT id, workspace_id, label, created_at, last_used_at FROM workspace_api_keys")
    .all() as Array<{ id: string; workspace_id: string; label: string; created_at: number; last_used_at: number | null }>

  const usage = new Map<string, { requests: number; tokens: number }>()
  workspaces.forEach((workspace) => {
    usage.set(workspace.id, usageSummary(workspace.id))
  })

  const retentionLogs = getSetting("retention_logs_days", String(env.RETENTION_LOGS_DAYS))
  const retentionTelemetry = getSetting("retention_telemetry_days", String(env.RETENTION_TELEMETRY_DAYS))
  const retentionUsage = getSetting("retention_usage_days", String(env.RETENTION_USAGE_DAYS))

  const newKey = c.req.query("newKey")

  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent-Core Hosted Console</title>
  <style>
    body { font-family: "IBM Plex Sans", "Space Grotesk", sans-serif; background: #f4f3ef; margin: 0; color: #2a2520; }
    header { padding: 24px 32px; background: #fff; border-bottom: 1px solid #e0d8cd; display: flex; justify-content: space-between; align-items: center; }
    main { padding: 24px 32px 48px; display: grid; gap: 24px; }
    section { background: #fff; border: 1px solid #e0d8cd; border-radius: 16px; padding: 20px; box-shadow: 0 12px 30px rgba(25,18,10,0.12); }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .grid { display: grid; gap: 12px; }
    .card { border: 1px solid #eadfd2; border-radius: 12px; padding: 12px; background: #fbfaf8; }
    label { font-size: 12px; color: #5b534a; display: block; margin-top: 8px; }
    input, select { width: 100%; padding: 8px 10px; border-radius: 10px; border: 1px solid #cfc5b6; margin-top: 4px; }
    button { padding: 8px 12px; border-radius: 10px; border: 0; background: #b4542a; color: #fff; font-weight: 600; cursor: pointer; }
    button.secondary { background: #2b7c4d; }
    button.ghost { background: transparent; color: #b4542a; border: 1px solid #b4542a; }
    .meta { font-size: 12px; color: #6f675f; }
    .pill { display: inline-flex; padding: 2px 8px; border-radius: 999px; background: #f0d8c7; color: #b4542a; font-size: 12px; font-weight: 600; }
    .warning { color: #b23131; }
  </style>
</head>
<body>
  <header>
    <div>
      <strong>Hosted console</strong>
      <div class="meta">${escapeHtml(user.email)}</div>
    </div>
    <form method="post" action="/console/logout">
      <button type="submit" class="ghost">Sign out</button>
    </form>
  </header>
  <main>
    ${newKey ? `<section><h2>New workspace API key</h2><div class="card"><div class="meta">Copy this key now. It will not be shown again.</div><div><code>${escapeHtml(newKey)}</code></div></div></section>` : ""}

    <section>
      <h2>Organizations</h2>
      <div class="grid">
        ${orgRows
          .map(
            (org) => `
          <div class="card">
            <div><strong>${escapeHtml(org.name)}</strong></div>
            <div class="meta">Org ID: ${escapeHtml(org.id)}</div>
            <div class="meta">Owner: ${escapeHtml(org.owner_user_id)}</div>
            <form method="post" action="/console/orgs/${escapeHtml(org.id)}/rename" class="row">
              <input name="name" placeholder="Rename org" />
              <button type="submit" class="ghost">Rename</button>
            </form>
            <form method="post" action="/console/orgs/${escapeHtml(org.id)}/workspaces" class="row">
              <input name="name" placeholder="New workspace" required />
              <button type="submit">Create workspace</button>
            </form>
          </div>`,
          )
          .join("")}
      </div>
      <form method="post" action="/console/orgs" class="row">
        <input name="name" placeholder="New organization name" required />
        <button type="submit">Create org</button>
      </form>
    </section>

    <section>
      <h2>Workspaces</h2>
      <div class="grid">
        ${workspaces
          .map((workspace) => {
            const plan = getPlan(workspace.plan)
            const usageRow = usage.get(workspace.id) ?? { requests: 0, tokens: 0 }
            const workspaceProviders = providers.filter((provider) => provider.workspace_id === workspace.id)
            const workspaceKeys = apiKeys.filter((key) => key.workspace_id === workspace.id)
            return `
          <div class="card">
            <div class="row" style="justify-content: space-between; align-items: center;">
              <div>
                <strong>${escapeHtml(workspace.name)}</strong>
                <div class="meta">Workspace ID: ${escapeHtml(workspace.id)}</div>
              </div>
              <span class="pill">${escapeHtml(plan.name)}</span>
            </div>
            <div class="meta">Requests this month: ${usageRow.requests} / ${plan.requestCap ?? "unlimited"}</div>
            <div class="meta">Tokens this month: ${usageRow.tokens} / ${plan.tokenCap ?? "unlimited"}</div>
            <form method="post" action="/console/workspaces/${escapeHtml(workspace.id)}/rename" class="row">
              <input name="name" placeholder="Rename workspace" />
              <button type="submit" class="ghost">Rename</button>
            </form>
            <form method="post" action="/console/workspaces/${escapeHtml(workspace.id)}/plan" class="row">
              <select name="plan">
                ${Object.values(planCatalog)
                  .map((catalogPlan) => `
                  <option value="${catalogPlan.id}" ${catalogPlan.id === workspace.plan ? "selected" : ""}>${catalogPlan.name}</option>`,
                  )
                  .join("")}
              </select>
              <button type="submit">Update plan</button>
            </form>
            <div class="meta">API Keys: ${workspaceKeys.length}</div>
            <form method="post" action="/console/workspaces/${escapeHtml(workspace.id)}/api-keys" class="row">
              <input name="label" placeholder="API key label" required />
              <button type="submit" class="secondary">Create API key</button>
            </form>
            ${workspaceKeys
              .map((key) => `
              <div class="meta">Key: ${escapeHtml(key.label)} (created ${new Date(key.created_at).toLocaleDateString()})</div>`,
              )
              .join("")}
            <h3>Providers</h3>
            ${workspaceProviders.length === 0 ? `<div class="meta">No providers connected.</div>` : ""}
            ${workspaceProviders
              .map(
                (provider) => `
              <div class="row" style="align-items: center; justify-content: space-between;">
                <div class="meta">${escapeHtml(provider.provider_id)} (${escapeHtml(provider.connection_type)})</div>
                <form method="post" action="/console/workspaces/${escapeHtml(workspace.id)}/providers/${escapeHtml(provider.id)}/disconnect">
                  <button type="submit" class="ghost">Disconnect</button>
                </form>
              </div>`,
              )
              .join("")}
            <form method="post" action="/console/workspaces/${escapeHtml(workspace.id)}/providers" class="grid">
              <label>Provider ID</label>
              <input name="provider_id" placeholder="openai" required />
              <label>Base URL</label>
              <input name="base_url" placeholder="https://api.openai.com" />
              <label>API key</label>
              <input name="api_key" placeholder="Provider API key" required />
              <button type="submit">Connect provider</button>
            </form>
            <form method="post" action="/console/workspaces/${escapeHtml(workspace.id)}/providers/oauth" class="grid">
              <label>OAuth provider ID</label>
              <input name="provider_id" placeholder="openai" required />
              <button type="submit" class="secondary">Start OAuth flow</button>
            </form>
          </div>`
          })
          .join("")}
      </div>
    </section>

    <section>
      <h2>Retention settings</h2>
      <form method="post" action="/console/retention" class="row">
        <label>Logs (days)<input name="logs" value="${escapeHtml(retentionLogs)}" /></label>
        <label>Telemetry (days)<input name="telemetry" value="${escapeHtml(retentionTelemetry)}" /></label>
        <label>Usage (days)<input name="usage" value="${escapeHtml(retentionUsage)}" /></label>
        <button type="submit">Update retention</button>
      </form>
    </section>

    <section>
      <h2>Billing portal</h2>
      <p class="meta">Use an external billing portal if configured.</p>
      <form method="post" action="/console/billing/portal">
        <button type="submit">Open billing portal</button>
      </form>
    </section>
  </main>
</body>
</html>`)
})

app.post("/console/orgs", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string; email: string }
  const body = await c.req.parseBody()
  const name = String(body.name ?? "").trim()
  if (!name) return c.redirect("/console")
  const orgId = randomUUID()
  db.prepare("INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, name, user.id, now())
  db.prepare("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, user.id, "owner", now())
  return c.redirect("/console")
})

app.post("/console/orgs/:orgId/rename", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const orgId = c.req.param("orgId")
  if (!hasOrgAccess(user.id, orgId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const name = String(body.name ?? "").trim()
  if (name) {
    db.prepare("UPDATE orgs SET name = ? WHERE id = ?").run(name, orgId)
  }
  return c.redirect("/console")
})

app.post("/console/orgs/:orgId/workspaces", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const orgId = c.req.param("orgId")
  if (!hasOrgAccess(user.id, orgId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const name = String(body.name ?? "").trim()
  if (!name) return c.redirect("/console")
  const workspaceId = randomUUID()
  db.prepare(
    "INSERT INTO workspaces (id, org_id, name, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(workspaceId, orgId, name, env.DEFAULT_PLAN, "active", now())
  db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(workspaceId, user.id, "owner", now())
  return c.redirect("/console")
})

app.post("/console/workspaces/:workspaceId/rename", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const name = String(body.name ?? "").trim()
  if (name) db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(name, workspaceId)
  return c.redirect("/console")
})

app.post("/console/workspaces/:workspaceId/plan", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const planId = String(body.plan ?? env.DEFAULT_PLAN)
  const plan = getPlan(planId)
  db.prepare(
    "UPDATE workspaces SET plan = ?, usage_cap_requests = ?, usage_cap_tokens = ? WHERE id = ?",
  ).run(plan.id, plan.requestCap, plan.tokenCap, workspaceId)
  recordBillingEvent(workspaceId, "plan.updated", { plan: plan.id })
  return c.redirect("/console")
})

app.post("/console/workspaces/:workspaceId/api-keys", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const label = String(body.label ?? "default").trim() || "default"
  const rawKey = `ac_${randomBytes(24).toString("hex")}`
  db.prepare(
    "INSERT INTO workspace_api_keys (id, workspace_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, hashApiKey(rawKey), label, now())
  return c.redirect(`/console?newKey=${encodeURIComponent(rawKey)}`)
})

app.post("/console/workspaces/:workspaceId/providers", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const providerId = String(body.provider_id ?? "").trim()
  const baseUrl = String(body.base_url ?? "").trim() || "https://api.openai.com"
  const apiKey = String(body.api_key ?? "").trim()
  if (!providerId || !apiKey) return c.redirect("/console")
  const payload = { base_url: baseUrl, api_key: apiKey }
  db.prepare(
    "INSERT INTO provider_connections (id, workspace_id, provider_id, connection_type, encrypted_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, providerId, "api", encryptJson(payload), now(), now())
  return c.redirect("/console")
})

app.post("/console/workspaces/:workspaceId/providers/oauth", requireConsoleAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return c.redirect("/console")
  const body = await c.req.parseBody()
  const providerId = String(body.provider_id ?? "").trim()
  if (!providerId) return c.redirect("/console")
  const config = getOauthConfig(providerId)
  if (!config) return c.redirect("/console")
  const state = randomUUID()
  db.prepare("INSERT INTO oauth_states (state, provider_id, workspace_id, created_at) VALUES (?, ?, ?, ?)")
    .run(state, providerId, workspaceId, now())
  const redirectUri = `${env.BASE_URL}/oauth/${providerId}/callback`
  const url = new URL(config.authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  if (config.scopes) url.searchParams.set("scope", config.scopes)
  url.searchParams.set("state", state)
  return c.redirect(url.toString())
})

app.post("/console/workspaces/:workspaceId/providers/:connectionId/disconnect", requireConsoleAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  const connectionId = c.req.param("connectionId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return c.redirect("/console")
  db.prepare("DELETE FROM provider_connections WHERE id = ? AND workspace_id = ?").run(connectionId, workspaceId)
  return c.redirect("/console")
})

app.post("/console/retention", requireConsoleAuth, async (c) => {
  const body = await c.req.parseBody()
  const logs = String(body.logs ?? "")
  const telemetry = String(body.telemetry ?? "")
  const usage = String(body.usage ?? "")
  if (logs) setSetting("retention_logs_days", logs)
  if (telemetry) setSetting("retention_telemetry_days", telemetry)
  if (usage) setSetting("retention_usage_days", usage)
  applyRetention()
  return c.redirect("/console")
})

app.post("/console/billing/portal", requireConsoleAuth, (c) => {
  if (env.BILLING_PORTAL_URL) {
    return c.redirect(env.BILLING_PORTAL_URL)
  }
  return c.redirect("/console")
})

const api = new Hono()
app.route("/api", api)

api.post("/auth/register", async (c) => {
  if (!env.ALLOW_SIGNUP) return jsonResponse(c, { error: "Signups disabled" }, 403)
  const body = await c.req.json().catch(() => null)
  if (!body) return jsonResponse(c, { error: "Invalid JSON" }, 400)
  const parsedEmail = emailSchema.safeParse(String(body.email ?? "").trim().toLowerCase())
  const parsedPassword = passwordSchema.safeParse(String(body.password ?? ""))
  if (!parsedEmail.success || !parsedPassword.success) {
    return jsonResponse(c, { error: "Invalid email or password" }, 400)
  }
  if (getUserByEmail(parsedEmail.data)) {
    return jsonResponse(c, { error: "Email already registered" }, 409)
  }
  const userId = randomUUID()
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, parsedEmail.data, hashPassword(parsedPassword.data), now())
  const sessionId = createSession(userId)
  setSessionCookie(c, sessionId)
  return jsonResponse(c, { id: userId, email: parsedEmail.data })
})

api.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return jsonResponse(c, { error: "Invalid JSON" }, 400)
  const email = String(body.email ?? "").trim().toLowerCase()
  const password = String(body.password ?? "")
  const user = getUserByEmail(email)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return jsonResponse(c, { error: "Invalid credentials" }, 401)
  }
  const sessionId = createSession(user.id)
  setSessionCookie(c, sessionId)
  return jsonResponse(c, { id: user.id, email: user.email })
})

api.post("/auth/logout", requireApiAuth, (c) => {
  const sessionId = getCookie(c, "agent_core_hosted_session")
  if (sessionId) db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId)
  clearSessionCookie(c)
  return jsonResponse(c, { ok: true })
})

api.get("/auth/me", (c) => {
  const sessionId = getCookie(c, "agent_core_hosted_session")
  const user = getUserFromSession(sessionId)
  if (!user) return jsonResponse(c, { user: null })
  return jsonResponse(c, { user })
})

api.get("/orgs", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const orgs = db
    .prepare("SELECT id, name, owner_user_id, created_at FROM orgs WHERE id IN (SELECT org_id FROM org_members WHERE user_id = ?)")
    .all(user.id)
  return jsonResponse(c, { orgs })
})

api.post("/orgs", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const body = await c.req.json().catch(() => null)
  if (!body?.name) return jsonResponse(c, { error: "Missing name" }, 400)
  const orgId = randomUUID()
  db.prepare("INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, String(body.name).trim(), user.id, now())
  db.prepare("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(orgId, user.id, "owner", now())
  return jsonResponse(c, { id: orgId })
})

api.patch("/orgs/:orgId", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const orgId = c.req.param("orgId")
  if (!hasOrgAccess(user.id, orgId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  if (!body?.name) return jsonResponse(c, { error: "Missing name" }, 400)
  db.prepare("UPDATE orgs SET name = ? WHERE id = ?").run(String(body.name).trim(), orgId)
  return jsonResponse(c, { ok: true })
})

api.get("/orgs/:orgId/workspaces", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const orgId = c.req.param("orgId")
  if (!hasOrgAccess(user.id, orgId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const workspaces = db
    .prepare("SELECT id, name, plan, status, created_at FROM workspaces WHERE org_id = ?")
    .all(orgId)
  return jsonResponse(c, { workspaces })
})

api.post("/orgs/:orgId/workspaces", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const orgId = c.req.param("orgId")
  if (!hasOrgAccess(user.id, orgId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  if (!body?.name) return jsonResponse(c, { error: "Missing name" }, 400)
  const workspaceId = randomUUID()
  db.prepare(
    "INSERT INTO workspaces (id, org_id, name, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(workspaceId, orgId, String(body.name).trim(), env.DEFAULT_PLAN, "active", now())
  db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run(workspaceId, user.id, "owner", now())
  return jsonResponse(c, { id: workspaceId })
})

api.get("/workspaces/:workspaceId", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const workspace = getWorkspaceById(workspaceId)
  return jsonResponse(c, { workspace })
})

api.patch("/workspaces/:workspaceId", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  if (!body?.name) return jsonResponse(c, { error: "Missing name" }, 400)
  db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(String(body.name).trim(), workspaceId)
  return jsonResponse(c, { ok: true })
})

api.post("/workspaces/:workspaceId/api-keys", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => ({}))
  const label = String(body.label ?? "default").trim() || "default"
  const rawKey = `ac_${randomBytes(24).toString("hex")}`
  db.prepare(
    "INSERT INTO workspace_api_keys (id, workspace_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, hashApiKey(rawKey), label, now())
  return jsonResponse(c, { key: rawKey })
})

api.get("/workspaces/:workspaceId/api-keys", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const keys = db
    .prepare("SELECT id, label, created_at, last_used_at FROM workspace_api_keys WHERE workspace_id = ?")
    .all(workspaceId)
  return jsonResponse(c, { keys })
})

api.get("/workspaces/:workspaceId/providers", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const providers = db
    .prepare("SELECT id, provider_id, connection_type, created_at FROM provider_connections WHERE workspace_id = ?")
    .all(workspaceId)
  return jsonResponse(c, { providers })
})

api.post("/workspaces/:workspaceId/providers", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  if (!body?.provider_id || !body?.api_key) return jsonResponse(c, { error: "Missing provider_id or api_key" }, 400)
  const payload = {
    base_url: String(body.base_url ?? "https://api.openai.com"),
    api_key: String(body.api_key),
    account_label: String(body.account_label ?? ""),
  }
  db.prepare(
    "INSERT INTO provider_connections (id, workspace_id, provider_id, connection_type, encrypted_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, String(body.provider_id), "api", encryptJson(payload), now(), now())
  return jsonResponse(c, { ok: true })
})

api.delete("/workspaces/:workspaceId/providers/:connectionId", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  const connectionId = c.req.param("connectionId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  db.prepare("DELETE FROM provider_connections WHERE id = ? AND workspace_id = ?").run(connectionId, workspaceId)
  return jsonResponse(c, { ok: true })
})

api.post("/workspaces/:workspaceId/providers/:providerId/oauth/authorize", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  const providerId = c.req.param("providerId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const config = getOauthConfig(providerId)
  if (!config) return jsonResponse(c, { error: "OAuth not configured" }, 400)
  const state = randomUUID()
  db.prepare("INSERT INTO oauth_states (state, provider_id, workspace_id, created_at) VALUES (?, ?, ?, ?)")
    .run(state, providerId, workspaceId, now())
  const redirectUri = `${env.BASE_URL}/oauth/${providerId}/callback`
  const url = new URL(config.authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  if (config.scopes) url.searchParams.set("scope", config.scopes)
  url.searchParams.set("state", state)
  return jsonResponse(c, { url: url.toString() })
})

api.post("/share", async (c) => {
  const auth = requireShareAuth(c)
  if (!auth.ok) return jsonResponse(c, { error: auth.message }, auth.status)

  const body = await c.req.json().catch(() => null)
  if (!body?.info || !body?.messages) {
    return jsonResponse(c, { error: "Missing info or messages" }, 400)
  }

  const rateKey = `share:${getClientIp(c)}`
  const limit = checkRateLimit(rateKey, env.RATE_LIMIT_PER_MINUTE, 60 * 1000)
  if (!limit.allowed) {
    return jsonResponse(c, { error: "Rate limit exceeded" }, 429)
  }

  let slug = generateShareSlug()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = db.prepare("SELECT slug FROM shares WHERE slug = ?").get(slug) as { slug: string } | undefined
    if (!existing) break
    slug = generateShareSlug()
  }

  const expiresAt = now() + env.SHARE_TTL_HOURS * 60 * 60 * 1000
  const createdBy = auth.key ? `api:${auth.key.slice(0, 6)}` : "anonymous"
  db.prepare("INSERT INTO shares (slug, created_at, expires_at, created_by, title, data) VALUES (?, ?, ?, ?, ?, ?)")
    .run(slug, now(), expiresAt, createdBy, String(body.title ?? ""), JSON.stringify(body))

  return jsonResponse(c, { slug, url: `${env.BASE_URL}/share/${slug}`, expires_at: expiresAt })
})

api.get("/share/:slug", (c) => {
  const slug = c.req.param("slug")
  const row = db.prepare("SELECT data, expires_at FROM shares WHERE slug = ?").get(slug) as
    | { data: string; expires_at: number }
    | undefined
  if (!row) return jsonResponse(c, { error: "Not found" }, 404)
  if (row.expires_at < now()) return jsonResponse(c, { error: "Share expired" }, 404)
  const parsed = JSON.parse(row.data)
  return jsonResponse(c, parsed)
})

api.post("/telemetry", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.kind) return jsonResponse(c, { error: "Missing kind" }, 400)
  db.prepare("INSERT INTO telemetry_events (id, workspace_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), body.workspace_id ?? null, String(body.kind), JSON.stringify(body.payload ?? {}), now())
  applyRetention()
  return jsonResponse(c, { ok: true })
})

api.post("/logs", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.level || !body?.message) return jsonResponse(c, { error: "Missing level or message" }, 400)
  db.prepare("INSERT INTO log_events (id, workspace_id, level, message, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      randomUUID(),
      body.workspace_id ?? null,
      String(body.level),
      String(body.message),
      JSON.stringify(body.meta ?? {}),
      now(),
    )
  applyRetention()
  return jsonResponse(c, { ok: true })
})

api.get("/analytics/summary", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.query("workspace_id")
  if (!workspaceId) return jsonResponse(c, { error: "Missing workspace_id" }, 400)
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  return jsonResponse(c, { summary: usageSummary(workspaceId) })
})

api.get("/billing/plans", (c) => {
  return jsonResponse(c, { plans: Object.values(planCatalog) })
})

api.post("/workspaces/:workspaceId/plan", requireApiAuth, async (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.param("workspaceId")
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const body = await c.req.json().catch(() => null)
  const planId = String(body?.plan ?? env.DEFAULT_PLAN)
  const plan = getPlan(planId)
  db.prepare("UPDATE workspaces SET plan = ?, usage_cap_requests = ?, usage_cap_tokens = ? WHERE id = ?")
    .run(plan.id, plan.requestCap, plan.tokenCap, workspaceId)
  recordBillingEvent(workspaceId, "plan.updated", { plan: plan.id })
  return jsonResponse(c, { ok: true })
})

api.post("/billing/portal", requireApiAuth, (c) => {
  if (!env.BILLING_PORTAL_URL) return jsonResponse(c, { error: "Billing portal not configured" }, 501)
  return jsonResponse(c, { url: env.BILLING_PORTAL_URL })
})

api.get("/billing/history", requireApiAuth, (c) => {
  const user = c.get("user") as { id: string }
  const workspaceId = c.req.query("workspace_id")
  if (!workspaceId) return jsonResponse(c, { error: "Missing workspace_id" }, 400)
  if (!hasWorkspaceAccess(user.id, workspaceId)) return jsonResponse(c, { error: "Forbidden" }, 403)
  const events = db
    .prepare("SELECT id, event, amount, metadata, created_at FROM billing_events WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId)
  return jsonResponse(c, { events })
})

api.post("/settings/retention", requireApiAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (body?.logs_days) setSetting("retention_logs_days", String(body.logs_days))
  if (body?.telemetry_days) setSetting("retention_telemetry_days", String(body.telemetry_days))
  if (body?.usage_days) setSetting("retention_usage_days", String(body.usage_days))
  applyRetention()
  return jsonResponse(c, { ok: true })
})

api.post("/gateway/:workspaceId/chat", async (c) => {
  const workspaceId = c.req.param("workspaceId")
  const sessionId = getCookie(c, "agent_core_hosted_session")
  const user = getUserFromSession(sessionId)
  const workspaceKey = getWorkspaceKey(c)

  const isMember = user ? hasWorkspaceAccess(user.id, workspaceId) : false
  const keyValid = validateWorkspaceKey(workspaceId, workspaceKey)
  if (!isMember && !keyValid) return jsonResponse(c, { error: "Unauthorized" }, 401)

  const workspace = getWorkspaceById(workspaceId)
  if (!workspace) return jsonResponse(c, { error: "Workspace not found" }, 404)

  const plan = getPlan(workspace.plan)
  const usage = usageSummary(workspaceId)
  if (plan.requestCap !== null && usage.requests + 1 > plan.requestCap) {
    return jsonResponse(c, { error: "Request limit exceeded" }, 429)
  }
  if (plan.tokenCap !== null && usage.tokens > plan.tokenCap) {
    return jsonResponse(c, { error: "Token limit exceeded" }, 429)
  }

  const payload = await c.req.json().catch(() => null)
  if (!payload?.messages) return jsonResponse(c, { error: "Missing messages" }, 400)

  const providerId = String(payload.provider_id ?? "")
  const connection = providerId
    ? (db
        .prepare(
          "SELECT encrypted_data FROM provider_connections WHERE workspace_id = ? AND provider_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(workspaceId, providerId) as { encrypted_data: string } | undefined)
    : (db
        .prepare("SELECT encrypted_data FROM provider_connections WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(workspaceId) as { encrypted_data: string } | undefined)

  if (!connection) return jsonResponse(c, { error: "No provider connected" }, 400)

  const connData = decryptJson<{ base_url: string; api_key?: string; access_token?: string }>(connection.encrypted_data)
  const baseUrl = connData.base_url.replace(/\/$/, "")
  const apiKey = connData.api_key ?? connData.access_token
  if (!apiKey) return jsonResponse(c, { error: "Provider credentials missing" }, 400)

  const upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: payload.model ?? "gpt-4.1-mini",
      messages: payload.messages,
      temperature: payload.temperature,
    }),
  })

  if (!upstream.ok) {
    const errorText = await upstream.text()
    return jsonResponse(c, { error: "Upstream error", detail: errorText }, 502)
  }

  const data = await upstream.json()
  const tokens = Number(data?.usage?.total_tokens ?? 0)
  db.prepare(
    "INSERT INTO usage_events (id, workspace_id, provider_id, model, tokens, requests, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    randomUUID(),
    workspaceId,
    providerId || null,
    String(payload.model ?? ""),
    tokens,
    1,
    JSON.stringify({ request_id: data?.id ?? null }),
    now(),
  )
  applyRetention()

  return jsonResponse(c, data)
})

app.get("/oauth/:providerId/callback", async (c) => {
  const providerId = c.req.param("providerId")
  const code = c.req.query("code")
  const state = c.req.query("state")
  if (!code || !state) return c.html("Missing code or state", 400)
  const record = db
    .prepare("SELECT workspace_id FROM oauth_states WHERE state = ? AND provider_id = ?")
    .get(state, providerId) as { workspace_id: string } | undefined
  if (!record) return c.html("Invalid OAuth state", 400)
  const config = getOauthConfig(providerId)
  if (!config) return c.html("OAuth not configured", 400)

  let tokenPayload: { access_token: string; refresh_token?: string } = { access_token: code }
  if (config.tokenUrl && config.clientSecret) {
    const body = new URLSearchParams()
    body.set("grant_type", "authorization_code")
    body.set("code", code)
    body.set("client_id", config.clientId)
    body.set("client_secret", config.clientSecret)
    body.set("redirect_uri", `${env.BASE_URL}/oauth/${providerId}/callback`)
    const res = await fetch(config.tokenUrl, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } })
    if (!res.ok) {
      const text = await res.text()
      return c.html(`Token exchange failed: ${escapeHtml(text)}`, 502)
    }
    const json = await res.json()
    tokenPayload = { access_token: json.access_token, refresh_token: json.refresh_token }
  }

  const encrypted = encryptJson({ base_url: config.baseUrl, access_token: tokenPayload.access_token, refresh_token: tokenPayload.refresh_token })
  db.prepare(
    "INSERT INTO provider_connections (id, workspace_id, provider_id, connection_type, encrypted_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), record.workspace_id, providerId, "oauth", encrypted, now(), now())
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state)
  return c.redirect("/console")
})

const renderMessagePart = (part: any) => {
  if (!part) return ""
  if (part.type === "text" || part.type === "reasoning") {
    return `<pre>${escapeHtml(String(part.text ?? ""))}</pre>`
  }
  if (part.type === "snapshot") {
    return `<pre>Snapshot ${escapeHtml(String(part.snapshot ?? ""))}</pre>`
  }
  if (part.type === "file") {
    const name = part.filename ? escapeHtml(String(part.filename)) : "attachment"
    return `<div class="file"><a href="${escapeHtml(String(part.url ?? ""))}">${name}</a></div>`
  }
  return `<pre>${escapeHtml(JSON.stringify(part, null, 2))}</pre>`
}

const renderSharePage = (slug: string, data: any) => {
  const info = data?.info ?? {}
  const messages = data?.messages ? Object.values(data.messages) : []
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shared session ${escapeHtml(slug)}</title>
  <style>
    body { font-family: "IBM Plex Sans", "Space Grotesk", sans-serif; background: #f4f3ef; margin: 0; color: #2a2520; }
    header { padding: 24px 32px; background: #fff; border-bottom: 1px solid #e0d8cd; }
    main { padding: 24px 32px 48px; display: grid; gap: 16px; }
    .card { background: #fff; border: 1px solid #e0d8cd; border-radius: 14px; padding: 16px; box-shadow: 0 12px 24px rgba(25,18,10,0.1); }
    .meta { font-size: 12px; color: #6f675f; }
    pre { background: #1f1c18; color: #f6f2ee; padding: 12px; border-radius: 12px; overflow: auto; }
    .role { font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <div class="meta">Shared session</div>
    <h1>${escapeHtml(info.title ?? "Session")}</h1>
    <div class="meta">${escapeHtml(info.id ?? slug)}</div>
  </header>
  <main>
    ${messages
      .map((message: any) => {
        const messageInfo = message.info ?? {}
        const parts = message.parts ?? []
        return `
      <div class="card">
        <div class="role">${escapeHtml(String(messageInfo.role ?? "message"))}</div>
        <div class="meta">${escapeHtml(String(messageInfo.model ?? ""))}</div>
        <div class="grid">
          ${parts.map(renderMessagePart).join("")}
        </div>
      </div>`
      })
      .join("")}
  </main>
</body>
</html>`
}

app.get("/share/:slug", (c) => {
  const slug = c.req.param("slug")
  const row = db.prepare("SELECT data, expires_at FROM shares WHERE slug = ?").get(slug) as
    | { data: string; expires_at: number }
    | undefined
  if (!row) return c.html("Share not found", 404)
  if (row.expires_at < now()) return c.html("Share expired", 404)
  const parsed = JSON.parse(row.data)
  return c.html(renderSharePage(slug, parsed))
})

app.get("/s/:slug", (c) => c.redirect(`/share/${c.req.param("slug")}`))

export { app }

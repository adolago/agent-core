import { describeRoute, resolver, validator } from "hono-openapi"
import { Hono } from "hono"
import { z } from "zod"
import { streamSSE } from "hono/streaming"
import { GlobalBus } from "@/bus/global"
import { Log } from "../../util/log"
import { Agent } from "../../agent/agent"
import { errors } from "../error"

const WEB_UI_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>agent-core web</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f4f1;
        --bg-accent: #ece7df;
        --panel: #ffffff;
        --panel-border: #d9d1c7;
        --text: #2d2a26;
        --muted: #6f675f;
        --accent: #b4542a;
        --accent-weak: #f0d8c7;
        --success: #2b7c4d;
        --danger: #b23131;
        --shadow: 0 18px 40px rgba(25, 18, 10, 0.12);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "Space Grotesk", "IBM Plex Sans", "Source Sans 3", "Segoe UI", sans-serif;
        background: radial-gradient(circle at top left, #f8efe3 0%, var(--bg) 45%, #f2ede7 100%);
        color: var(--text);
      }

      header {
        padding: 24px clamp(20px, 4vw, 48px);
        border-bottom: 1px solid var(--panel-border);
        background: linear-gradient(120deg, #ffffff 0%, #f7f0e7 100%);
      }

      header h1 {
        margin: 0;
        font-size: clamp(22px, 3vw, 34px);
        letter-spacing: -0.02em;
      }

      header p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 20px;
        padding: 24px clamp(20px, 4vw, 48px) 48px;
      }

      section {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 18px;
        box-shadow: var(--shadow);
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 280px;
      }

      section h2 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.01em;
      }

      .meta {
        font-size: 12px;
        color: var(--muted);
      }

      .list {
        display: grid;
        gap: 10px;
        overflow: auto;
      }

      .card {
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 10px 12px;
        display: grid;
        gap: 6px;
      }

      button, input, textarea, select {
        font-family: inherit;
      }

      button {
        border: 1px solid var(--panel-border);
        background: var(--accent);
        color: white;
        padding: 8px 12px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
      }

      button.secondary {
        background: transparent;
        color: var(--accent);
        border-color: var(--accent);
      }

      button.danger {
        background: var(--danger);
        border-color: var(--danger);
      }

      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      input, textarea, select {
        width: 100%;
        border: 1px solid var(--panel-border);
        border-radius: 10px;
        padding: 8px 10px;
        background: #fff;
      }

      textarea {
        min-height: 120px;
        resize: vertical;
      }

      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--accent-weak);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
      }

      .status-ok { color: var(--success); }
      .status-bad { color: var(--danger); }
      pre {
        background: #1c1a17;
        color: #f3f1ee;
        padding: 12px;
        border-radius: 12px;
        overflow: auto;
        max-height: 260px;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>agent-core web console</h1>
      <p>Sessions, files, settings, and provider auth for your local daemon.</p>
      <div class="meta" id="path-meta">Loading workspace…</div>
    </header>
    <main>
      <section>
        <h2>Sessions</h2>
        <div class="list" id="sessions-list"></div>
        <div class="card" id="session-detail">
          <strong>Session detail</strong>
          <div class="meta" id="session-detail-body">Select a session to view.</div>
          <div class="row">
            <button id="share-btn" disabled>Share</button>
            <button id="unshare-btn" class="secondary" disabled>Unshare</button>
          </div>
        </div>
      </section>

      <section>
        <h2>File tree</h2>
        <div class="row">
          <input id="file-path" placeholder="Path" />
          <button id="file-refresh">Load</button>
        </div>
        <div class="list" id="file-list"></div>
        <pre id="file-content">Select a file to view.</pre>
      </section>

      <section>
        <h2>Settings</h2>
        <textarea id="config-text" spellcheck="false"></textarea>
        <div class="row">
          <button id="config-save">Save config</button>
          <span class="meta" id="config-status"></span>
        </div>
      </section>

      <section>
        <h2>Provider auth</h2>
        <div class="list" id="provider-list"></div>
      </section>
    </main>

    <script>
      const sessionList = document.getElementById("sessions-list");
      const sessionDetail = document.getElementById("session-detail-body");
      const shareBtn = document.getElementById("share-btn");
      const unshareBtn = document.getElementById("unshare-btn");
      const filePathInput = document.getElementById("file-path");
      const fileList = document.getElementById("file-list");
      const fileContent = document.getElementById("file-content");
      const configText = document.getElementById("config-text");
      const configStatus = document.getElementById("config-status");
      const providerList = document.getElementById("provider-list");
      const pathMeta = document.getElementById("path-meta");

      let selectedSession = null;

      async function api(path, options = {}) {
        const res = await fetch(path, {
          headers: { "Accept": "application/json", ...(options.headers || {}) },
          ...options,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        return res.json();
      }

      async function loadPaths() {
        try {
          const data = await api("/path");
          pathMeta.textContent = \`Worktree: \${data.worktree} · Directory: \${data.directory}\`;
          filePathInput.value = data.worktree;
          await loadFiles();
        } catch (err) {
          pathMeta.textContent = "Failed to load workspace paths.";
        }
      }

      async function loadSessions() {
        sessionList.innerHTML = "";
        const sessions = await api("/session?limit=50");
        sessions.forEach((session) => {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = \`
            <strong>\${session.title}</strong>
            <div class="meta">\${session.id}</div>
            <div class="meta">Updated \${new Date(session.time.updated).toLocaleString()}</div>
          \`;
          card.addEventListener("click", () => selectSession(session.id));
          sessionList.appendChild(card);
        });
      }

      async function selectSession(id) {
        selectedSession = await api(\`/session/\${id}\`);
        sessionDetail.textContent = \`ID: \${selectedSession.id}\\nTitle: \${selectedSession.title}\\nShare: \${selectedSession.share?.url || "Not shared"}\`;
        shareBtn.disabled = false;
        unshareBtn.disabled = !selectedSession.share;
      }

      shareBtn.addEventListener("click", async () => {
        if (!selectedSession) return;
        try {
          selectedSession = await api(\`/session/\${selectedSession.id}/share\`, { method: "POST" });
          sessionDetail.textContent = \`ID: \${selectedSession.id}\\nTitle: \${selectedSession.title}\\nShare: \${selectedSession.share?.url || "Not shared"}\`;
          unshareBtn.disabled = !selectedSession.share;
        } catch (err) {
          alert(err.message || err);
        }
      });

      unshareBtn.addEventListener("click", async () => {
        if (!selectedSession) return;
        try {
          selectedSession = await api(\`/session/\${selectedSession.id}/share\`, { method: "DELETE" });
          sessionDetail.textContent = \`ID: \${selectedSession.id}\\nTitle: \${selectedSession.title}\\nShare: \${selectedSession.share?.url || "Not shared"}\`;
          unshareBtn.disabled = true;
        } catch (err) {
          alert(err.message || err);
        }
      });

      async function loadFiles() {
        const path = filePathInput.value.trim();
        if (!path) return;
        fileList.innerHTML = "";
        const entries = await api(\`/file?path=\${encodeURIComponent(path)}\`);
        entries.forEach((entry) => {
          const node = document.createElement("div");
          node.className = "card";
          const isDir = entry.type === "directory";
          node.innerHTML = \`
            <div class="row" style="justify-content: space-between; align-items:center;">
              <span>\${entry.name}</span>
              <span class="pill">\${isDir ? "dir" : "file"}</span>
            </div>
          \`;
          node.addEventListener("click", async () => {
            if (isDir) {
              filePathInput.value = entry.path;
              await loadFiles();
              return;
            }
            const content = await api(\`/file/content?path=\${encodeURIComponent(entry.path)}\`);
            fileContent.textContent = content.content ?? "";
          });
          fileList.appendChild(node);
        });
      }

      document.getElementById("file-refresh").addEventListener("click", loadFiles);

      async function loadConfig() {
        const config = await api("/config");
        configText.value = JSON.stringify(config, null, 2);
      }

      document.getElementById("config-save").addEventListener("click", async () => {
        configStatus.textContent = "Saving…";
        try {
          const payload = JSON.parse(configText.value);
          await api("/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          configStatus.textContent = "Saved.";
        } catch (err) {
          configStatus.textContent = "Failed to save.";
          alert(err.message || err);
        }
      });

      async function loadProviders() {
        providerList.innerHTML = "";
        const [providers, methods, status] = await Promise.all([
          api("/provider"),
          api("/provider/auth"),
          api("/provider/auth/status"),
        ]);
        providers.all.forEach((provider) => {
          const card = document.createElement("div");
          card.className = "card";
          const providerMethods = methods[provider.id] || [];
          const statusInfo = status[provider.id];
          const statusLabel = statusInfo ? (statusInfo.valid ? "connected" : "expired") : "disconnected";
          card.innerHTML = \`
            <strong>\${provider.name}</strong>
            <div class="meta">ID: \${provider.id}</div>
            <div class="meta">Status: <span class="\${statusInfo?.valid ? "status-ok" : "status-bad"}">\${statusLabel}</span></div>
          \`;

          providerMethods.forEach((method, idx) => {
            const methodWrap = document.createElement("div");
            methodWrap.className = "row";
            if (method.type === "api") {
              const input = document.createElement("input");
              input.placeholder = \`\${method.label} API key\`;
              const connectBtn = document.createElement("button");
              connectBtn.textContent = "Connect";
              connectBtn.addEventListener("click", async () => {
                const key = input.value.trim();
                if (!key) return;
                await api(\`/auth/\${provider.id}\`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "api", key }) });
                await loadProviders();
              });
              methodWrap.appendChild(input);
              methodWrap.appendChild(connectBtn);
            } else if (method.type === "oauth") {
              const authBtn = document.createElement("button");
              authBtn.textContent = \`Authorize (\${method.label})\`;
              authBtn.addEventListener("click", async () => {
                const auth = await api(\`/provider/\${provider.id}/oauth/authorize\`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ method: idx }),
                });
                if (!auth) return;
                window.open(auth.url, "_blank");
                if (auth.method === "code") {
                  const code = window.prompt("Paste the authorization code:");
                  if (!code) return;
                  await api(\`/provider/\${provider.id}/oauth/callback\`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ method: idx, code }),
                  });
                }
                await loadProviders();
              });
              methodWrap.appendChild(authBtn);
            }
            card.appendChild(methodWrap);
          });

          const disconnectBtn = document.createElement("button");
          disconnectBtn.className = "secondary";
          disconnectBtn.textContent = "Disconnect";
          disconnectBtn.addEventListener("click", async () => {
            await api(\`/auth/\${provider.id}\`, { method: "DELETE" });
            await loadProviders();
          });
          card.appendChild(disconnectBtn);
          providerList.appendChild(card);
        });
      }

      Promise.all([loadPaths(), loadSessions(), loadConfig(), loadProviders()]).catch((err) => {
        console.error(err);
      });
    </script>
  </body>
</html>`;

export const AppRoute = new Hono()
  .get("/", (c) => c.html(WEB_UI_HTML))
  .get(
    "/event",
    describeRoute({
      summary: "Subscribe to events",
      description: "Get events",
      operationId: "event.subscribe",
      responses: {
        200: {
          description: "Event stream (text/event-stream)",
        },
      },
    }),
    async (c) => {
      return streamSSE(c, async (stream) => {
        const subscriptions: (() => void)[] = []

        const handler = async (event: { directory?: string; payload: any }) => {
          const payload = {
            type: event.payload.type,
            properties: event.payload.properties,
          }
          await stream.writeSSE({
            event: event.payload.type,
            // Include legacy and payload shapes for SDK compatibility.
            data: JSON.stringify({
              directory: event.directory,
              type: payload.type,
              properties: payload.properties,
              payload,
            }),
          })
        }
        GlobalBus.on("event", handler)
        subscriptions.push(() => GlobalBus.off("event", handler))

        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({ timestamp: Date.now() }),
        })

        const keepalive = setInterval(async () => {
          try {
            await stream.writeSSE({
              event: "keepalive",
              data: JSON.stringify({ timestamp: Date.now() }),
            })
          } catch {
            clearInterval(keepalive)
          }
        }, 30000)

        stream.onAbort(() => {
          clearInterval(keepalive)
          subscriptions.forEach((unsub) => unsub())
        })

        await new Promise(() => {})
      })
    },
  )
  .post(
    "/log",
    describeRoute({
      summary: "Write log",
      description: "Write a log entry to the server logs with specified level and metadata.",
      operationId: "app.log",
      responses: {
        200: {
          description: "Log entry written successfully",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "json",
      z.object({
        service: z.string().meta({ description: "Service name for the log entry" }),
        level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
        message: z.string().meta({ description: "Log message" }),
        extra: z
          .record(z.string(), z.any())
          .optional()
          .meta({ description: "Additional metadata for the log entry" }),
      }),
    ),
    async (c) => {
      const { service, level, message, extra } = c.req.valid("json")
      const logger = Log.create({ service })

      switch (level) {
        case "debug":
          logger.debug(message, extra)
          break
        case "info":
          logger.info(message, extra)
          break
        case "error":
          logger.error(message, extra)
          break
        case "warn":
          logger.warn(message, extra)
          break
      }

      return c.json(true)
    },
  )
  .get(
    "/agent",
    describeRoute({
      summary: "List agents",
      description: "Get a list of all available AI agents in the agent-core system.",
      operationId: "app.agents",
      responses: {
        200: {
          description: "List of agents",
          content: {
            "application/json": {
              schema: resolver(Agent.Info.array()),
            },
          },
        },
      },
    }),
    async (c) => {
      const modes = await Agent.list()
      return c.json(modes)
    },
  )

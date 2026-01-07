## session page latency

### tl;dr

Session switching (especially via `alt+arrowup/down`) currently pays latency in three buckets:

1. **Network**: `sync.session.sync(sessionID)` always refetches session + messages + todo + diff.
2. **Storage hydration (desktop)**: session-scoped providers (`PromptProvider`, `TerminalProvider`, `FileProvider` view state) re-mount per session and hydrate from async storage. During hydration they expose default values, and some effects can do extra work before `ready()`.
3. **Render/CPU**: mounting a session can render a lot of turns; Markdown/Shiki and other rich UI can dominate time even after network returns.

This spec proposes a phased plan to make session switching feel “instant” by aggressively using caching + prefetch + incremental rendering, while being careful about the new storage system.

---

### current architecture snapshot (relevant bits)

#### routing + session switching

- Session route: `/:dir/session/:id?`.
- The subtree is keyed by session id (and “new”): `packages/app/src/app.tsx` (keyed `<Show when={p.params.id ?? "new"} keyed>`).
  - This means switching sessions **unmounts/remounts** `TerminalProvider`, `FileProvider`, `PromptProvider`, and the full session page.

#### data loading

- `packages/app/src/pages/session.tsx` calls `sync.session.sync(params.id)` on every navigation.
- `packages/app/src/context/sync.tsx` `session.sync()` currently does 4 requests in parallel:
  - `session.get`, `session.messages(limit=1000)`, `session.todo`, `session.diff`.

#### storage (post 761863ae3)

- `packages/app/src/utils/persist.ts`
  - Introduces `Persist.{global,workspace,session,scoped}` targets.
  - Performs **legacy key migration**, default merging, and writes back normalized JSON.
  - Desktop is async storage; web is sync localStorage.
- Desktop storage (`packages/desktop/src/index.tsx`)
  - Now caches stores per file name and debounces writes.
  - Still async `getItem` per key; initial stores start with defaults until hydrate completes.

#### key observation: “defaults during hydrate”

On desktop, `persisted()` can’t synchronously read from disk, so stores start with defaults and update later.
If we do side effects based on those defaults (e.g., “no terminals exist → create one”), we can create extra server calls and worsen latency.

---

### goals

**Primary UX goal**

- Switching sessions via keyboard should _feel_ instant.
  - If the target session was viewed recently: show real content in ~1 frame (sub-100ms, ideally <50ms).
  - Cold sessions should still feel responsive: render a shell immediately and progressively fill.

**Correctness goals**

- No spurious side effects during async hydration (e.g., creating PTYs, clearing prompt, etc.).
- Session-specific UI state (prompt, terminal tabs, file view state, scroll positions) remains correct.

**Performance goals**

- Avoid repeated refetches for sessions already in memory.
- Avoid heavy work for offscreen/hidden UI.

---

### non-goals

- Large UI redesign of the session page layout.
- Perfect “0 work” switching for never-before-seen sessions.

---

### measurement & debugging (phase 0)

We need a tight feedback loop before changing behavior.

**0.1 Add timing marks (dev-only)**

- Add a lightweight performance logger gated by `import.meta.env.DEV`.
- Track:
  - `navigate:start` (in `navigateSessionByOffset()` in `packages/app/src/pages/layout.tsx`).
  - `session:params` (when `params.id` changes in `packages/app/src/pages/session.tsx`).
  - `session:data-ready` (when `sync.data.message[sessionID]` becomes defined).
  - `session:first-turn-mounted` (when first `SessionTurn` mounts).
  - `storage:prompt-ready`, `storage:terminal-ready`, `storage:file-view-ready` (from their `ready()` signals).
- Emit a single structured console line per navigation so we can compare before/after.

**0.2 Quick “what is slow” panel (optional)**

- A tiny dev overlay showing last navigation timings.

Acceptance:

- We can produce “P50/P95” from console logs during manual navigation.

#### playwriter workflow (dev)

If you have the app running locally (e.g. `http://localhost:3002`), Playwriter can automate session navigation and aggregate the `perf.session-nav` logs.

Notes:

- Click the page background before sending `Alt+ArrowDown/Up` so the global keybind handler receives the event.
- Some navigations can emit `reason:"timeout"` (missing marks). Ignore these when aggregating.
- `navigate:start` is only present for keyboard navigation via `alt+arrowup/down`; click navigation will use `base: session:params`.

Example Playwriter tool calls (paste each into `playwriter_execute`; one call per block):

```js
// call 1: attach listeners + optional network counters
const p = context.pages().find((p) => p.url().includes("localhost:3002")) || page
state.p = p
state.navLogs = []
state.req = 0
state.res = 0
p.removeAllListeners("console")
p.removeAllListeners("request")
p.removeAllListeners("response")
p.on("console", (m) => {
  const t = m.text()
  if (t.startsWith("perf.session-nav ")) state.navLogs.push(t)
})
p.on("request", (r) => {
  if (r.url().includes("localhost:4096/session/")) state.req++
})
p.on("response", (r) => {
  if (r.url().includes("localhost:4096/session/")) state.res++
})
```

```js
// call 2: drive keyboard navigation
const p = state.p
await p.mouse.click(200, 200)
for (let i = 0; i < 20; i++) {
  const before = p.url()
  await p.keyboard.press("Alt+ArrowDown")
  await p.waitForFunction((u) => location.href !== u, before, { timeout: 5000 })
}
```

```js
// call 3: summarize (exclude timeouts)
const done = state.navLogs
  .map((l) => JSON.parse(l.replace(/^perf\.session-nav\s+/, "")))
  .filter((x) => x.reason === "complete")
const pick = (k) =>
  done
    .map((x) => x.ms?.[k])
    .filter((n) => typeof n === "number")
    .sort((a, b) => a - b)
const pct = (arr, q) => (arr.length ? arr[Math.floor((arr.length - 1) * q)] : undefined)
console.log({
  count: done.length,
  req: state.req,
  res: state.res,
  dataReady: { p50: pct(pick("session:data-ready"), 0.5), p95: pct(pick("session:data-ready"), 0.95) },
  firstTurn: { p50: pct(pick("session:first-turn-mounted"), 0.5), p95: pct(pick("session:first-turn-mounted"), 0.95) },
})
state.p.removeAllListeners("console")
state.p.removeAllListeners("request")
state.p.removeAllListeners("response")
```

#### baseline snapshot (example run, web dev)

On a local web run (app at `localhost:3002`, API at `localhost:4096`), each session switch currently issues 4 HTTP GETs:

- `/session/:id`
- `/session/:id/message?limit=1000`
- `/session/:id/todo`
- `/session/:id/diff`

Example timings from 8 sequential `alt+arrowdown` switches (web):

- `session:params`: P50 ~26ms, P95 ~37ms
- `session:data-ready`: P50 ~37ms, P95 ~228ms (max ~298ms)
- `session:first-turn-mounted`: P50 ~44ms, P95 ~259ms (max ~312ms)
- Render delta (`first-turn-mounted - data-ready`): median ~6–7ms, max ~30ms

Rapid-navigation sanity check:

- 10 fast `alt+arrowdown` presses (80ms spacing) triggered ~7 navigations and ~28 session HTTP requests (4 per navigation), which supports phase 1’s inflight-dedupe goal.

Interpretation:

- Tail latency is dominated by network + payload size today (phases 1/2/5).
- Render cost is usually small but can spike on larger sessions (phase 4).
- Storage-ready marks are near `session:params` on web (sync localStorage); desktop should surface real async hydration gaps.

---

### phase 1: stop wasting network time

**1.1 Make `sync.session.sync()` idempotent + deduped**

- Add `inflight` map keyed by `sessionID` so rapid navigation doesn’t fire redundant requests.
- Add a “already loaded” fast path:
  - If `store.message[sessionID]`, `store.todo[sessionID]`, and `store.session_diff[sessionID]` are already present (or at least `message`), skip the blocking refetch.
  - Optionally refresh in the background (low priority) only when:
    - `session_status` indicates busy/retry
    - or the session was updated very recently

Implementation notes:

- Mirror the approach used in the TUI sync (`packages/opencode/src/cli/cmd/tui/context/sync.tsx`) where it tracks fully synced sessions.

**1.2 Reduce initial message payload**

- Lower the default initial `session.messages` limit (1000 → e.g. 200) to improve time-to-first-render.
- Add a “load more history” mechanism that fetches older messages when needed.
  - Either via explicit “Load earlier messages” button
  - or on scroll near top

**1.3 Lazy-load todo/diff**

- Don’t fetch `todo` or `diff` unless the UI actually needs it.
  - Example: fetch `diff` only when review panel is visible/active.
  - Example: fetch `todo` only when steps panel is opened.

Acceptance:

- Switching between already-loaded sessions performs 0 session-related HTTP calls.
- Switching between cold sessions performs fewer total bytes and returns first content faster.

---

### phase 2: prefetch aggressively for keyboard navigation

**2.1 Prefetch adjacent sessions**

- In `packages/app/src/pages/layout.tsx`, after computing the next/prev session for `alt+arrowup/down`, prefetch:
  - `nextSessionID`
  - `prevSessionID`
- Prefetch strategy:
  - Use a small concurrency limit (e.g. 1–2) per directory.
  - Cancel/ignore stale prefetches when directory changes.
  - Prefer “messages only” prefetch first; todo/diff can be deferred.

**2.2 Prefetch on hover/focus in session list**

- In `SessionItem` (sidebar list), prefetch on:
  - mouseenter
  - keyboard focus

Acceptance:

- When using keyboard navigation in the session list, most navigations hit the cache.

---

### phase 3: fix async-hydration side effects (storage-aware)

This phase is specifically motivated by the storage overhaul.

**3.1 Gate side effects on `ready()`**
Audit for effects that assume persisted state is already hydrated.

Concrete examples to address:

- `packages/app/src/pages/session.tsx`:
  - The “ensure terminal exists when terminal panel is open” logic should not run until `terminal.ready()`.
  - Any prompt-state restoration or autofocus logic should be careful not to fight hydration.

- Any place that calls `*.new()` or triggers network requests based on persisted defaults should wait for ready.

**3.2 Make “defaults during hydrate” invisible**
Where possible, avoid showing the “empty default” state before hydration completes:

- For prompt: keep previous prompt visible until the new prompt is ready, then swap.
- For terminal tabs: keep previous terminal UI visible until hydrated.

This can be done without removing the keyed route by adding small “handoff” logic:

- Capture previous session’s rendered UI state
- Render it while the new session’s storage/data loads
- Swap when both data + storage are ready

**3.3 Storage warmup (optional)**
Because the storage layer is cached and async, we can warm keys for the next/prev sessions:

- For adjacent sessions, call `platform.storage(workspaceFile).getItem("session:<id>:prompt")` etc.
- This is optional; the bigger win is preventing side effects and flicker.

Acceptance:

- No terminal/PTy creation occurs purely due to session navigation.
- Prompt/terminal/file view state does not “flash” to defaults on desktop.

---

### phase 4: render/CPU improvements (make big sessions fast)

Even with perfect caching, rendering can be the bottleneck.

**4.1 Incremental turn rendering**

- Render only the most recent N turns initially (e.g. last 20 user turns).
- Backfill older turns during idle time (`requestIdleCallback` / `setTimeout(0)` batching).
- Ensure scroll anchoring stays stable.

**4.2 Virtualize the message list (if needed)**

- If incremental rendering isn’t enough, implement windowing for the session turn list.
- Start with a minimal custom virtualization approach to avoid a new dependency unless needed.

**4.3 Cache expensive Markdown/Shiki**

- Cache rendered HTML per part id + content hash so session revisits don’t re-highlight.
- Ensure cache is bounded (LRU).

**4.4 Don’t render hidden tab content**

- Confirm whether inactive `Tabs.Content` is mounted.
- If it is, gate heavy children behind `Show when={activeTab()===...}` so review/file panes don’t do work while switching sessions.

Acceptance:

- Switching to a “big” session does not block the UI thread for noticeable time.

---

### phase 5 (optional / longer-term): reduce remount cost structurally

Today’s keyed route is a simple correctness mechanism for per-session providers. It also forces a full teardown/rebuild.

Two options:

**Option A: keep keyed route, optimize everything else**

- With phases 1–4, the remount should be cheap enough.
- This is the lowest-risk path.

**Option B: remove keyed remount by introducing a session-scope layer**

- Introduce a new `SessionScopeProvider` that:
  - keeps providers mounted
  - internally switches stores based on `params.id`
  - caches per-session state in memory (bounded)
- This is more invasive, but could deliver the smoothest transitions.

If we go with Option B, do it _after_ phases 1–4 so we can justify the complexity.

---

### rollout plan

- Ship phases behind a dev flag first.
- Add a small runtime toggle (env var or query param) to compare old/new quickly.
- Iterate using the performance logs from phase 0.

---

### test plan

**Manual**

- Desktop and web:
  - open terminal panel, switch sessions rapidly → ensure no extra terminals created.
  - switch sessions rapidly with `alt+arrowup/down` → verify minimal/no network calls when cached.
  - switch to very large session → verify UI remains responsive.

**Automated (where reasonable)**

- Unit tests for `sync.session.sync` caching/dedupe behavior.
- Unit tests for persisted key migration (optional).

---

### open questions

- Do we want “session switch” to be allowed to show stale data briefly (optimistic UI) while background refresh runs?
- Is it acceptable to show partial message history until the user scrolls up?
- Should review/todo be fully lazy, or always eager on desktop?

---

### execution sequence (delegation-ready)

This section turns the phases above into an explicit, PR-by-PR execution sequence intended for delegation to multiple agents.

Principles:

- Keep PRs small and shippable.
- Prefer measurable wins early (instrumentation → caching → prefetch).
- Be careful with the new storage model: on desktop, persisted stores start with defaults and hydrate async; side effects must respect `ready()`.

#### PR 1 — baseline instrumentation (dev-only)

**Goal**: establish a baseline and make regressions obvious.

**Tasks**

- Add a tiny dev-only perf logger (gated by `import.meta.env.DEV`).
- Emit one structured log line per session navigation.
- Capture timings for:
  - `navigate:start` (triggered from keyboard navigation)
  - `session:params` (route param change)
  - `storage:*:ready` (prompt/terminal/file view)
  - `session:data-ready` (messages available)
  - `session:first-turn-mounted` (render committed)

**Primary files**

- `packages/app/src/pages/layout.tsx`
- `packages/app/src/pages/session.tsx`
- `packages/app/src/context/prompt.tsx`
- `packages/app/src/context/terminal.tsx`
- `packages/app/src/context/file.tsx`

**Acceptance criteria**

- Console output includes consistent keys and durations.
- Repeated keybind navigation produces enough data to compare “before/after”.

**Suggested agent prompt**

- “Implement dev-only perf marks/logging for session navigation and storage readiness, per `specs/session-page-latency.md` PR 1. Keep it minimal and don’t change behavior yet.”

---

#### PR 2 — gate hydration-sensitive side effects

**Goal**: prevent spurious work caused by async persisted store hydration on desktop.

**Tasks**

- Audit effects that act on default state before hydration finishes.
- Explicitly gate these effects on the relevant `ready()` signal.

**Known hotspot**

- `packages/app/src/pages/session.tsx`: when terminal panel is open, it ensures there is at least one terminal by calling `terminal.new()` if `terminal.all().length === 0`.
  - On desktop, `terminal.all()` can be empty until hydration finishes → avoid creating terminals during navigation.

**Primary files**

- `packages/app/src/pages/session.tsx`

**Acceptance criteria**

- Rapidly switching sessions does not create additional terminal PTYs.
- Prompt/terminal/file state does not flash to defaults purely due to hydration.

**Suggested agent prompt**

- “Make session navigation storage-safe: gate side effects (especially terminal auto-create) on `terminal.ready()` / other `ready()` signals. Confirm no new network calls are triggered during hydration.”

---

#### PR 3 — make `sync.session` idempotent + add `ensure/prefetch` API

**Goal**: avoid refetching session data when it’s already in memory; dedupe inflight loads.

**Tasks**

- Implement `inflight` dedupe for `sync.session.sync()`.
- Add a “already loaded” fast path (minimum: if `message[sessionID]` exists, don’t block on refetch).
- Introduce a clean API for callers:
  - `sync.session.ensure(sessionID, opts)` for interactive navigation
  - `sync.session.prefetch(sessionID, opts)` for background warming
- Update `packages/app/src/pages/session.tsx` to use the new API instead of unconditional `sync()`.

**Primary files**

- `packages/app/src/context/sync.tsx`
- `packages/app/src/pages/session.tsx`

**Acceptance criteria**

- Navigating to a recently visited session triggers 0 session-related HTTP requests.
- Rapid keybind navigation does not create duplicate inflight requests for the same session.

**Suggested agent prompt**

- “Refactor `packages/app/src/context/sync.tsx` session sync into `ensure/prefetch` with inflight dedupe and a fast path when messages already exist. Update session page to call `ensure()`.”

---

#### PR 4 — prefetch adjacent sessions (keyboard + hover)

**Goal**: make `alt+arrowup/down` navigation feel instant by warming the next targets.

**Tasks**

- Add adjacent-session prefetch:
  - After determining next/prev session IDs in `navigateSessionByOffset()`, trigger prefetch for both.
  - Also prefetch when the currently selected session changes.
- Add prefetch on session list item `mouseenter` and keyboard focus.
- Add a tiny concurrency limiter (per directory) so prefetch can’t flood the server.

**Primary files**

- `packages/app/src/pages/layout.tsx`
- `packages/app/src/context/sync.tsx` (prefetch queue/helper)

**Acceptance criteria**

- Holding `alt+arrowdown` should mostly hit cache after the first hop.
- Prefetch does not starve interactive navigation requests.

**Suggested agent prompt**

- “Implement adjacent-session prefetch for keyboard navigation + list hover/focus prefetch, using the `sync.session.prefetch()` API. Include a small concurrency limiter.”

---

#### PR 5 — reduce cold-load payload + lazy-load diff/todo

**Goal**: improve time-to-first-content for sessions that aren’t cached.

**Tasks**

- Reduce initial `session.messages` limit (e.g. 1000 → 200).
- Implement a way to fetch older history on demand (button or scroll near top).
- Defer fetching:
  - `session.diff` until review panel is actually needed
  - `session.todo` until steps/todo UI is opened

**Primary files**

- `packages/app/src/context/sync.tsx`
- `packages/app/src/pages/session.tsx`

**Acceptance criteria**

- Cold navigation shows initial turns faster (measurable via PR 1 logs).
- Review/todo still load correctly when opened.

**Suggested agent prompt**

- “Reduce initial message load size and lazy-load session diff/todo. Add a ‘load earlier messages’ pathway that merges into existing store.”

---

#### PR 6+ — render/CPU work: keep big sessions responsive

**Goal**: ensure rendering doesn’t dominate perceived latency.

**Tasks (recommended order)**

- Ensure heavy tab content doesn’t render when hidden (if `Tabs.Content` is mounted while inactive, gate heavy children on active tab).
- Incremental turn rendering: render last N turns first, backfill during idle time.
- Cache Markdown/Shiki results per part id + content hash (bounded LRU).
- Only if needed: message list virtualization.

**Primary files**

- `packages/app/src/pages/session.tsx`
- `packages/ui/src/components/markdown.tsx` and/or `packages/ui/src/context/marked.tsx` (if caching is implemented here)

**Acceptance criteria**

- Switching into a huge session does not produce noticeable UI-thread stalls.

**Suggested agent prompt**

- “Optimize session render cost: avoid rendering hidden heavy tab content; implement incremental rendering of turns; optionally add caching for markdown/shiki outputs. Measure improvements using PR 1 instrumentation.”

---

#### PR 7 (optional) — reduce remount cost structurally

**Goal**: eliminate full provider remount on session switch, _only if still needed after PRs 1–6_.

**Tasks**

- Option A: narrow the keyed boundary in `packages/app/src/app.tsx` so only truly session-scoped stores remount.
- Option B: introduce a `SessionScopeProvider` that keeps providers mounted and swaps session-scoped stores internally (bounded in-memory cache).

**Acceptance criteria**

- Session switching remains correct, but no longer tears down the full subtree.

**Suggested agent prompt**

- “If session switching still incurs noticeable overhead after caching/prefetch/render optimizations, redesign the session subtree to avoid full remounts (narrow keyed boundary or implement session scope provider).”

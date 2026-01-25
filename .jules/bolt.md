## 2026-01-23 - Avoid Expensive Sync Operations in SolidJS Effects
**Learning:** Calculating checksums (O(N)) for large strings inside `createEffect` blocks the main thread.
**Action:** Use `createMemo` to cache expensive calculations derived from props, ensuring they only re-run when specific dependencies change, not when the effect re-runs for other reasons.

## 2026-01-25 - Cache Compiled RegExp in Hot Paths
**Learning:** Recompiling regexes in utility functions called in loops (like `Wildcard.match`) is expensive (measured ~18x overhead).
**Action:** Use a simple module-level `Map` cache for compiled `RegExp` objects when patterns are repetitive.

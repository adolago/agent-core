## 2026-01-23 - Avoid Expensive Sync Operations in SolidJS Effects
**Learning:** Calculating checksums (O(N)) for large strings inside `createEffect` blocks the main thread.
**Action:** Use `createMemo` to cache expensive calculations derived from props, ensuring they only re-run when specific dependencies change, not when the effect re-runs for other reasons.

## 2026-01-25 - Cache Compiled RegExp in Hot Paths
**Learning:** Recompiling regexes in utility functions called in loops (like `Wildcard.match`) is expensive (measured ~18x overhead).
**Action:** Use a simple module-level `Map` cache for compiled `RegExp` objects when patterns are repetitive.

## 2026-05-24 - Hoist Merge Operations in Permission Checks
**Learning:** `PermissionNext.evaluate` was re-merging (flattening/copying) rulesets and logging large objects on every file check in `ask` loops (O(N) allocation/serialization).
**Action:** Hoisted the merge operation outside the loop and reduced log level to DEBUG. Introduced `evaluateRuleset` to handle pre-merged rulesets.

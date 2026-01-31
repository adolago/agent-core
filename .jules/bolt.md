## 2026-01-23 - Avoid Expensive Sync Operations in SolidJS Effects
**Learning:** Calculating checksums (O(N)) for large strings inside `createEffect` blocks the main thread.
**Action:** Use `createMemo` to cache expensive calculations derived from props, ensuring they only re-run when specific dependencies change, not when the effect re-runs for other reasons.

## 2026-01-25 - Cache Compiled RegExp in Hot Paths
**Learning:** Recompiling regexes in utility functions called in loops (like `Wildcard.match`) is expensive (measured ~18x overhead).
**Action:** Use a simple module-level `Map` cache for compiled `RegExp` objects when patterns are repetitive.

## 2026-02-14 - Optimize File Lookup
**Learning:** `Filesystem.findUp` in this codebase returns *all* matches up the directory tree (for config aggregation). Using it just to check if a file exists or to find the closest one is inefficient O(depth).
**Action:** Use `Filesystem.findFirstUp` when you only need the closest match or to check existence.

## 2026-02-14 - Optimize Path Parsing
**Learning:** `path.split()` creates unnecessary intermediate arrays (allocation overhead), which is costly in hot utility functions like `getFilename`.
**Action:** Use `lastIndexOf` and `slice` for path parsing to avoid allocation, especially in frequently called path utilities.

## 2026-03-01 - Optimize Filesystem Existence Checks
**Learning:** `Bun.file(path).exists()` is significantly faster (~14x for files, ~42x for non-existent items) than `stat()` but returns `false` for directories.
**Action:** Use `await Bun.file(path).exists()` as a fast path for file checks, falling back to `stat()` only for directories or confirmation. Also, use `path.includes()` guard before `path.replace()` in hot paths like `sanitizePath`.

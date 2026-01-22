## 2025-02-14 - Redaction Performance Surprise
**Learning:** Optimizing a "check all regexes" function by pre-scanning with a combined regex (`A|B|C...`) actually slowed down performance or had no benefit. This is likely because V8 optimizes individual simple regexes (with fixed prefixes) better than one massive complex regex.
**Action:** When optimizing regex sets, benchmark carefully. Don't assume `search(A|B)` is faster than `test(A) && test(B)` if A and B have simple prefixes.

## 2025-02-14 - Lazy Cloning Wins
**Learning:** Implementing Copy-On-Write (lazy cloning) for recursive object traversal provided a 3x speedup for clean objects.
**Action:** For recursive transformers that often return the input unchanged, always use the "return original if no change" pattern to save allocations.

## 2025-02-14 - Memoize Project Root
**Learning:** `getClaudeFlowRoot` was performing synchronous file I/O (`existsSync`, `readFileSync`, `JSON.parse`) on every call. In a long-running process, this is wasteful.
**Action:** Memoize static configuration values that require I/O resolution, especially if they are accessed frequently.

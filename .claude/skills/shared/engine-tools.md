# Engine-Level Tools Reference

*Advanced coding tools available to all personas via agent-core engine*

## LSP (Language Server Protocol)

Precise, IDE-grade code intelligence:

### Go to Definition
```
Find where a symbol is defined. More accurate than grep.
- Follows imports across files
- Handles aliases and re-exports
- Works with types, functions, classes
```

### Find All References
```
Find every usage of a symbol across the codebase.
- Complete, not just text matches
- Distinguishes definitions from usages
- Cross-file tracking
```

### Rename Symbol
```
Safely rename a symbol project-wide.
- Updates all references automatically
- Preserves imports
- Type-safe refactoring
```

### Hover Information
```
Get type information and documentation for any symbol.
- Function signatures
- Type definitions
- JSDoc/docstrings
```

## AST-Grep (Structural Code Search)

Pattern-based code search and transformation:

### Structural Search
```
Search for code patterns, not just text.
Example: Find all functions that call `console.log`:
  ast-grep --pattern '$FUNC($$$ARGS, console.log($MSG), $$$REST)'
```

### Structural Replace
```
Transform code patterns safely.
Example: Replace deprecated API:
  ast-grep --pattern 'oldApi($ARG)' --rewrite 'newApi({value: $ARG})'
```

### Use Cases
- Find all instances of a pattern
- Migrate API usages
- Enforce code style rules
- Identify anti-patterns

## When to Use Which

| Task | Tool | Why |
|------|------|-----|
| Find where X is defined | LSP go-to-definition | Precise, follows imports |
| Find all usages of X | LSP references | Complete, accurate |
| Rename variable/function | LSP rename | Safe, project-wide |
| Find code pattern | AST-grep search | Structural matching |
| Replace code pattern | AST-grep replace | Safe transformation |
| Quick text search | Grep | Fast, broad |
| Find files | Glob | Pattern matching |

## Integration Notes

These tools are provided by the agent-core engine and available to all personas:
- LSP requires language server running (auto-started for supported languages)
- AST-grep requires the `ast-grep` binary (auto-installed on first use)
- Both integrate with oh-my-opencode plugin for enhanced capabilities

## Supported Languages (LSP)

- TypeScript/JavaScript (tsserver)
- Python (pyright)
- Rust (rust-analyzer)
- Go (gopls)
- And more via opencode's LSP configuration

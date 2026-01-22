---
name: codebase-exploration
description: Fast, efficient codebase search to find where code lives, which files contain what, and how to locate specific patterns or implementations
triggers:
  - Questions starting with "Where is X?"
  - "Which file has Y?"
  - "Find code that does Z"
  - "Show me all uses of function A"
  - "What modules import B?"
  - "Where is the entry point for feature C?"
---

# Codebase Exploration Skill

## Purpose
Answer questions about where code lives, which files contain what, and how to find specific patterns or implementations in a codebase.

## Questions You Answer
- "Where is X implemented?"
- "Which file has Y?"
- "Find code that does Z"
- "Show me all uses of function A"
- "What modules import B?"
- "Where is the entry point for feature C?"

## Mandatory Output Format

### <analysis>
Brief statement of your intent and approach.

### (3+ parallel tools)
Launch multiple tools in parallel:
- `lsp_workspace_symbols` for semantic search
- `ast_grep_search` for structural patterns
- `grep` for text-based search
- `glob` for file pattern matching
- `git log` for history if relevant

### <results>
#### <files>
List of files found (absolute paths, line numbers)

#### <answer>
Direct answer to the actual need (not just file list)

#### <next_steps>
Concrete next actions user can take

## Tool Strategy

### LSP Tools (Semantic)
- `lsp_workspace_symbols` - Find definitions by name
- `lsp_find_references` - Find all usages of a symbol
- `lsp_goto_definition` - Jump to where something is defined
- `lsp_document_symbols` - Get outline of a file

### AST Tools (Structural)
- `ast_grep_search` - Match code structure/patterns
- Use for finding patterns like "async function calls with await X"
- Patterns must be complete AST nodes

### Text Tools (Literal)
- `grep` - Search for literal strings
- Good for searching config, comments, specific strings

### File Tools (Pattern)
- `glob` - Find files by name pattern
- `**/*.test.ts`, `src/**/*Controller.ts`, etc.

### Git Tools (History)
- `git log` - Find when something was changed
- Use for "when was this added?", "who changed this?"

## Search Patterns

### Function Definitions
- LSP: `lsp_workspace_symbols(query="functionName")`
- AST: `function $NAME($$$) { $$$ }`

### Function Calls
- AST: `functionName($$$)`
- Grep: `functionName(`

### Classes
- LSP: `lsp_workspace_symbols(query="ClassName")`
- AST: `class $NAME { $$$ }`

### Imports
- AST: `import $XXX from "$MODULE";`
- Grep: `from "packageName"`

### Async Patterns
- AST: `(?s)async function $NAME($$$) { $$$await $$$ }`
- Look for async/await usage

## Search Strategies

### Strategy 1: Narrow Down First
1. Use glob to find relevant files
2. Use grep for exact matches
3. Use LSP for semantic confirmation
4. Present filtered, focused results

### Strategy 2: Broad Then Deep
1. Use LSP workspace symbols for comprehensive search
2. Use AST grep for patterns
3. Read top candidates to verify
4. Present with confidence levels

### Strategy 3: Follow the Trail
1. Find entry point or main reference
2. Trace imports/exports
3. Follow call chains
4. Map out the relevant code area

## Rules

### Mandatory Requirements
1. ALWAYS include <analysis>, 3+ tools, <results>, <answer>, <next_steps>
2. ALWAYS use absolute paths in <files>
3. ALWAYS launch tools in parallel (one message)
4. ALWAYS provide direct answer, not just file list
5. NEVER implement or modify code (READ ONLY)
6. NEVER use emojis in output

### Tool Selection
- Prefer LSP for semantic searches (definitions, references)
- Use AST grep for structural patterns
- Use grep for text literals and config
- Use glob for file discovery
- Use git only when history/context is relevant

### Result Quality
- Verify results before presenting
- De-duplicate findings
- Organize by relevance
- Note uncertainties or limitations
- Provide line numbers when possible

## Communication Style
- **Direct**: Answer the actual question
- **Precise**: Use exact paths and line numbers
- **Structured**: Follow mandatory output format
- **Helpful**: Provide actionable next steps
- **Fast**: Use parallel tools for speed

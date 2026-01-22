---
name: codebase-research
description: Understanding open-source codebases, retrieving documentation, finding implementation examples, and researching remote repositories
triggers:
  - Looking up how external libraries/frameworks work
  - Finding examples of patterns in open-source repos
  - Researching GitHub repositories for implementation details
  - Understanding library internals or API usage
  - Finding documentation for specific technologies
---

# Codebase Research Skill

## Purpose
Understand open-source codebases, retrieve documentation, find implementation examples, and research remote repositories.

## Critical: Date Awareness
- **Current year is 2025 or later** (NOT 2024!)
- Always consider this when accessing documentation
- Account for library versions and API changes
- Note deprecated patterns vs current best practices

## Request Types

### Type A: Conceptual (Documentation & Knowledge)
**Goal**: Understand concepts, patterns, or how things work
**Tools**: context7, web search
**When**: User asks "How does X work?", "What's the pattern for Y?"

**Process**:
1. Use context7 for library/framework documentation
2. Use web search for latest information
3. Synthesize into clear explanation
4. Provide code examples if relevant

### Type B: Implementation (Source Code Analysis)
**Goal**: Find how something is implemented in a specific repo
**Tools**: GitHub CLI (gh), git blame, file reading
**When**: "Show me how X implements Y", "Find examples of pattern Z in repo A"

**Process**:
1. Clone repo to temporary directory: `${TMPDIR:-/tmp}/repo-name`
2. Use `gh repo clone` or `git clone`
3. Use `grep`, `ast_grep`, or LSP to find relevant code
4. Read implementation files thoroughly
5. Use `git blame` for context/history if needed
6. Clean up temporary directory when done

### Type C: Context (Issues, PRs, History)
**Goal**: Understand why decisions were made, track evolution
**Tools**: GitHub CLI (gh issues, gh pr), git log, git blame
**When**: "Why was this done this way?", "What's the history of X?"

**Process**:
1. Search for relevant issues/PRs on GitHub
2. Read issue discussions and PR descriptions
3. Check git log for commit history
4. Synthesize the reasoning and evolution
5. Note any trade-offs or debates

### Type D: Comprehensive (All of the Above)
**Goal**: Deep understanding from multiple angles
**Tools**: All tools in parallel
**When**: "Give me a complete picture of X"

**Process**:
1. Launch parallel tasks: documentation, implementation, context
2. Gather all information
3. Synthesize into cohesive understanding
4. Present findings clearly with citations

## Mandatory Citations

### GitHub Permalinks Required
When referencing code from GitHub:
- ALWAYS use permalinks (not just file paths)
- Include line numbers when relevant
- Format: `https://github.com/user/repo/blob/commit-hash/file.ts#L123-L456`
- Use `gh repo view --web` to get web links

### Evidence-Based Conclusions
- Support your claims with evidence
- Cite sources (docs, code, issues)
- Be explicit about what's verified vs what's inference
- Note when you're extrapolating

## Tool Usage Guidelines

### context7
- For library/framework documentation
- For API references
- For usage patterns and best practices
- Use specific, focused queries

### GitHub CLI (gh)
- `gh repo clone <repo>` - Clone to temp dir
- `gh issue list` - Find relevant issues
- `gh pr list` - Find relevant PRs
- `gh issue view <number>` - Read issue details
- `gh pr view <number>` - Read PR details
- `gh repo view --web` - Open in browser (get permalinks)

### Git
- `git log --oneline <path>` - History
- `git blame <file>` - Line-by-line authorship
- `git show <commit>` - Commit details

### Code Search
- Use `grep` for text search
- Use `ast_grep` for structural patterns
- Use `lsp_workspace_symbols` for semantic search

## Communication Style
- **Precise**: Be exact about what you found
- **Cited**: Always provide evidence with permalinks
- **Organized**: Structure your findings logically
- **Helpful**: Synthesize information into actionable insights

## Rules
1. ALWAYS use GitHub permalinks when citing code
2. ALWAYS clean up temporary directories when done
3. NEVER make claims without evidence
4. ALWAYS be date-aware (current year is 2025+)
5. NEVER guess - if you can't find it, say so
6. ALWAYS parallelize tasks when appropriate
7. NEVER mix up Type A/B/C/D requests

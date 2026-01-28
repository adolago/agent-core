/**
 * Shared vim command handling for the prompt textarea.
 * Extracts duplicated logic between global handler and focused handler.
 */

export namespace VimCommands {
  /**
   * Context required for vim command handling.
   * Abstracts the dependencies so the same logic can be used in both
   * the global handler (unfocused) and the focused handler.
   */
  export type VimCommandContext = {
    /** Get the current cursor position */
    getCursorOffset: () => number
    /** Set the cursor position */
    setCursorOffset: (offset: number) => void
    /** Get the full text content */
    getText: () => string
    /** Set the full text content */
    setText: (text: string) => void
    /** Insert text at cursor position */
    insertText: (text: string) => void
    /** Update the store with new input value */
    setStoreInput: (text: string) => void
  }

  /**
   * Result of handling a vim normal mode key.
   */
  export type VimCommandResult = {
    /** Whether the key was handled */
    handled: boolean
    /** Whether to enter insert mode after handling */
    enterInsert?: boolean
  }

  /**
   * Handle a single key press in vim normal mode.
   * Returns whether the key was handled and whether to enter insert mode.
   */
  export function handleNormalModeKey(ctx: VimCommandContext, key: string): VimCommandResult {
    // Insert mode commands - return enterInsert: true
    if (key === "i") {
      return { handled: true, enterInsert: true }
    }

    if (key === "a") {
      // Move cursor right (append after cursor)
      if (ctx.getCursorOffset() < ctx.getText().length) {
        ctx.setCursorOffset(ctx.getCursorOffset() + 1)
      }
      return { handled: true, enterInsert: true }
    }

    if (key === "I") {
      ctx.setCursorOffset(0)
      return { handled: true, enterInsert: true }
    }

    if (key === "A") {
      ctx.setCursorOffset(ctx.getText().length)
      return { handled: true, enterInsert: true }
    }

    if (key === "o") {
      ctx.setCursorOffset(ctx.getText().length)
      ctx.insertText("\n")
      return { handled: true, enterInsert: true }
    }

    if (key === "O") {
      ctx.setCursorOffset(0)
      ctx.insertText("\n")
      ctx.setCursorOffset(0)
      return { handled: true, enterInsert: true }
    }

    // Navigation commands - these do NOT enter insert mode
    if (key === "h") {
      if (ctx.getCursorOffset() > 0) {
        ctx.setCursorOffset(ctx.getCursorOffset() - 1)
      }
      return { handled: true }
    }

    if (key === "l") {
      if (ctx.getCursorOffset() < ctx.getText().length) {
        ctx.setCursorOffset(ctx.getCursorOffset() + 1)
      }
      return { handled: true }
    }

    if (key === "j") {
      const text = ctx.getText()
      const lines = text.split("\n")
      if (lines.length > 1) {
        const afterCursor = text.slice(ctx.getCursorOffset())
        const nextNewline = afterCursor.indexOf("\n")
        if (nextNewline !== -1) {
          ctx.setCursorOffset(ctx.getCursorOffset() + nextNewline + 1)
        } else {
          ctx.setCursorOffset(text.length)
        }
      }
      return { handled: true }
    }

    if (key === "k") {
      const text = ctx.getText()
      const beforeCursor = text.slice(0, ctx.getCursorOffset())
      const lastNewline = beforeCursor.lastIndexOf("\n")
      if (lastNewline !== -1) {
        const prevNewline = beforeCursor.lastIndexOf("\n", lastNewline - 1)
        ctx.setCursorOffset(prevNewline + 1)
      } else {
        ctx.setCursorOffset(0)
      }
      return { handled: true }
    }

    // Word motions
    if (key === "w") {
      const text = ctx.getText()
      let pos = ctx.getCursorOffset()
      // Skip current word
      while (pos < text.length && /\w/.test(text[pos])) pos++
      // Skip whitespace
      while (pos < text.length && /\s/.test(text[pos])) pos++
      ctx.setCursorOffset(pos)
      return { handled: true }
    }

    if (key === "b") {
      const text = ctx.getText()
      let pos = ctx.getCursorOffset() - 1
      // Skip whitespace
      while (pos > 0 && /\s/.test(text[pos])) pos--
      // Skip word
      while (pos > 0 && /\w/.test(text[pos - 1])) pos--
      ctx.setCursorOffset(Math.max(0, pos))
      return { handled: true }
    }

    if (key === "e") {
      const text = ctx.getText()
      let pos = ctx.getCursorOffset() + 1
      // Skip whitespace
      while (pos < text.length && /\s/.test(text[pos])) pos++
      // Move to end of word
      while (pos < text.length && /\w/.test(text[pos])) pos++
      ctx.setCursorOffset(Math.min(text.length, pos))
      return { handled: true }
    }

    // Line motions
    if (key === "0") {
      const text = ctx.getText()
      const beforeCursor = text.slice(0, ctx.getCursorOffset())
      const lastNewline = beforeCursor.lastIndexOf("\n")
      ctx.setCursorOffset(lastNewline + 1)
      return { handled: true }
    }

    if (key === "$") {
      const text = ctx.getText()
      const afterCursor = text.slice(ctx.getCursorOffset())
      const nextNewline = afterCursor.indexOf("\n")
      if (nextNewline !== -1) {
        ctx.setCursorOffset(ctx.getCursorOffset() + nextNewline)
      } else {
        ctx.setCursorOffset(text.length)
      }
      return { handled: true }
    }

    if (key === "^") {
      const text = ctx.getText()
      const beforeCursor = text.slice(0, ctx.getCursorOffset())
      const lastNewline = beforeCursor.lastIndexOf("\n")
      const lineStart = lastNewline + 1
      const afterLineStart = text.slice(lineStart)
      const firstNonSpace = afterLineStart.search(/\S/)
      ctx.setCursorOffset(lineStart + (firstNonSpace === -1 ? 0 : firstNonSpace))
      return { handled: true }
    }

    // Buffer motions
    if (key === "g") {
      // gg - go to start (handled as single g for simplicity)
      ctx.setCursorOffset(0)
      return { handled: true }
    }

    if (key === "G") {
      // G - go to end
      ctx.setCursorOffset(ctx.getText().length)
      return { handled: true }
    }

    // Delete commands
    if (key === "x") {
      const text = ctx.getText()
      const cursorOffset = ctx.getCursorOffset()
      if (cursorOffset < text.length) {
        const before = text.slice(0, cursorOffset)
        const after = text.slice(cursorOffset + 1)
        const newText = before + after
        ctx.setText(newText)
        ctx.setStoreInput(newText)
      }
      return { handled: true }
    }

    if (key === "X") {
      const text = ctx.getText()
      const cursorOffset = ctx.getCursorOffset()
      if (cursorOffset > 0) {
        const before = text.slice(0, cursorOffset - 1)
        const after = text.slice(cursorOffset)
        const newText = before + after
        ctx.setText(newText)
        ctx.setStoreInput(newText)
        ctx.setCursorOffset(cursorOffset - 1)
      }
      return { handled: true }
    }

    // Key not handled
    return { handled: false }
  }
}

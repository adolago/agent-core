import { describe, test, expect, beforeEach } from "bun:test"

/**
 * Tests for vim mode state transitions.
 *
 * The VimProvider in @tui/context/vim.tsx manages vim-style modal editing.
 * Since it relies on Solid.js reactivity and context providers, we test
 * the core state machine logic directly by simulating the provider's behavior.
 */

type VimMode = "normal" | "insert"

interface VimConfig {
  enabled?: boolean
  start_in_insert?: boolean
}

/**
 * Creates a vim mode state machine that mirrors the VimProvider implementation.
 * This allows us to test the state transitions without the full TUI context.
 */
function createVimState(config: VimConfig = {}) {
  const enabled = config.enabled !== false
  const startInInsert = config.start_in_insert === true

  let mode: VimMode = startInInsert ? "insert" : "normal"
  let focusCallbackInvoked = false
  let focusCallback: (() => void) | null = null

  return {
    get enabled() {
      return enabled
    },
    get mode(): VimMode {
      return enabled ? mode : "insert"
    },
    get isNormal() {
      return enabled && mode === "normal"
    },
    get isInsert() {
      return !enabled || mode === "insert"
    },
    setMode(newMode: VimMode) {
      if (!enabled) return
      mode = newMode
    },
    enterNormal() {
      if (!enabled) return
      mode = "normal"
    },
    enterInsert() {
      mode = "insert"
      focusCallback?.()
    },
    registerFocusCallback(fn: () => void) {
      focusCallback = fn
    },
    // Test helpers
    get _internalMode() {
      return mode
    },
    get _focusCallbackInvoked() {
      return focusCallbackInvoked
    },
    _resetFocusTracking() {
      focusCallbackInvoked = false
    },
  }
}

describe("Vim mode state machine", () => {
  describe("initial state", () => {
    test("initial mode is 'normal' when start_in_insert is false", () => {
      const vim = createVimState({ enabled: true, start_in_insert: false })
      expect(vim.mode).toBe("normal")
      expect(vim.isNormal).toBe(true)
      expect(vim.isInsert).toBe(false)
    })

    test("initial mode is 'normal' when start_in_insert is undefined (default)", () => {
      const vim = createVimState({ enabled: true })
      expect(vim.mode).toBe("normal")
      expect(vim.isNormal).toBe(true)
      expect(vim.isInsert).toBe(false)
    })

    test("initial mode is 'insert' when start_in_insert is true", () => {
      const vim = createVimState({ enabled: true, start_in_insert: true })
      expect(vim.mode).toBe("insert")
      expect(vim.isNormal).toBe(false)
      expect(vim.isInsert).toBe(true)
    })
  })

  describe("mode transitions", () => {
    let vim: ReturnType<typeof createVimState>

    beforeEach(() => {
      vim = createVimState({ enabled: true, start_in_insert: false })
    })

    test("enterNormal() switches from insert to normal", () => {
      vim.enterInsert()
      expect(vim.mode).toBe("insert")

      vim.enterNormal()
      expect(vim.mode).toBe("normal")
      expect(vim.isNormal).toBe(true)
      expect(vim.isInsert).toBe(false)
    })

    test("enterInsert() switches from normal to insert", () => {
      expect(vim.mode).toBe("normal")

      vim.enterInsert()
      expect(vim.mode).toBe("insert")
      expect(vim.isNormal).toBe(false)
      expect(vim.isInsert).toBe(true)
    })

    test("enterInsert() triggers the focus callback", () => {
      let callbackInvoked = false
      vim.registerFocusCallback(() => {
        callbackInvoked = true
      })

      expect(callbackInvoked).toBe(false)
      vim.enterInsert()
      expect(callbackInvoked).toBe(true)
    })

    test("enterInsert() does not throw when no callback is registered", () => {
      expect(() => vim.enterInsert()).not.toThrow()
    })

    test("setMode() works for switching to normal", () => {
      vim.enterInsert()
      expect(vim.mode).toBe("insert")

      vim.setMode("normal")
      expect(vim.mode).toBe("normal")
    })

    test("setMode() works for switching to insert", () => {
      expect(vim.mode).toBe("normal")

      vim.setMode("insert")
      expect(vim.mode).toBe("insert")
    })

    test("multiple mode transitions work correctly", () => {
      expect(vim.mode).toBe("normal")

      vim.enterInsert()
      expect(vim.mode).toBe("insert")

      vim.enterNormal()
      expect(vim.mode).toBe("normal")

      vim.setMode("insert")
      expect(vim.mode).toBe("insert")

      vim.setMode("normal")
      expect(vim.mode).toBe("normal")
    })
  })

  describe("disabled vim mode", () => {
    let vim: ReturnType<typeof createVimState>

    beforeEach(() => {
      vim = createVimState({ enabled: false })
    })

    test("mode always returns 'insert' when disabled", () => {
      expect(vim.mode).toBe("insert")
    })

    test("isNormal is always false when disabled", () => {
      expect(vim.isNormal).toBe(false)
    })

    test("isInsert is always true when disabled", () => {
      expect(vim.isInsert).toBe(true)
    })

    test("enterNormal() is a no-op when disabled", () => {
      vim.enterNormal()
      expect(vim.mode).toBe("insert")
      expect(vim.isNormal).toBe(false)
      expect(vim._internalMode).toBe("normal") // internal state unchanged by enterNormal when disabled
    })

    test("setMode() is a no-op when disabled", () => {
      // Internal mode starts as normal (since start_in_insert defaults to false)
      expect(vim._internalMode).toBe("normal")

      vim.setMode("insert")
      // setMode should be a no-op, so internal mode stays the same
      expect(vim._internalMode).toBe("normal")
      // But the external mode always reports insert
      expect(vim.mode).toBe("insert")

      vim.setMode("normal")
      expect(vim._internalMode).toBe("normal")
      expect(vim.mode).toBe("insert")
    })

    test("enterInsert() still changes internal state when disabled", () => {
      // Note: enterInsert() does NOT check enabled, matching the actual implementation
      // This allows focus callback to still work even when vim mode is disabled
      vim.enterNormal() // This is a no-op when disabled
      expect(vim._internalMode).toBe("normal")

      vim.enterInsert() // This changes internal mode to insert
      expect(vim._internalMode).toBe("insert")
      expect(vim.mode).toBe("insert") // Always insert when disabled
    })

    test("focus callback is triggered by enterInsert() even when disabled", () => {
      let callbackInvoked = false
      vim.registerFocusCallback(() => {
        callbackInvoked = true
      })

      vim.enterInsert()
      expect(callbackInvoked).toBe(true)
    })
  })

  describe("default configuration", () => {
    test("enabled defaults to true when not specified", () => {
      const vim = createVimState({})
      expect(vim.enabled).toBe(true)
    })

    test("start_in_insert defaults to false when not specified", () => {
      const vim = createVimState({})
      expect(vim.mode).toBe("normal")
    })

    test("empty config results in vim enabled, starting in normal mode", () => {
      const vim = createVimState({})
      expect(vim.enabled).toBe(true)
      expect(vim.mode).toBe("normal")
      expect(vim.isNormal).toBe(true)
      expect(vim.isInsert).toBe(false)
    })
  })

  describe("edge cases", () => {
    test("calling enterNormal() when already in normal mode is idempotent", () => {
      const vim = createVimState({ enabled: true })
      expect(vim.mode).toBe("normal")

      vim.enterNormal()
      expect(vim.mode).toBe("normal")

      vim.enterNormal()
      expect(vim.mode).toBe("normal")
    })

    test("calling enterInsert() when already in insert mode is idempotent", () => {
      const vim = createVimState({ enabled: true, start_in_insert: true })
      expect(vim.mode).toBe("insert")

      vim.enterInsert()
      expect(vim.mode).toBe("insert")

      vim.enterInsert()
      expect(vim.mode).toBe("insert")
    })

    test("focus callback is invoked each time enterInsert() is called", () => {
      const vim = createVimState({ enabled: true, start_in_insert: true })
      let callbackCount = 0
      vim.registerFocusCallback(() => {
        callbackCount++
      })

      vim.enterInsert()
      expect(callbackCount).toBe(1)

      vim.enterInsert()
      expect(callbackCount).toBe(2)

      vim.enterInsert()
      expect(callbackCount).toBe(3)
    })

    test("replacing focus callback works correctly", () => {
      const vim = createVimState({ enabled: true })
      let firstCalled = false
      let secondCalled = false

      vim.registerFocusCallback(() => {
        firstCalled = true
      })
      vim.enterInsert()
      expect(firstCalled).toBe(true)
      expect(secondCalled).toBe(false)

      vim.registerFocusCallback(() => {
        secondCalled = true
      })
      vim.enterInsert()
      expect(secondCalled).toBe(true)
    })

    test("setMode with same mode is idempotent", () => {
      const vim = createVimState({ enabled: true })
      expect(vim.mode).toBe("normal")

      vim.setMode("normal")
      expect(vim.mode).toBe("normal")

      vim.setMode("insert")
      expect(vim.mode).toBe("insert")

      vim.setMode("insert")
      expect(vim.mode).toBe("insert")
    })
  })

  describe("config combinations", () => {
    test("enabled: false, start_in_insert: true", () => {
      const vim = createVimState({ enabled: false, start_in_insert: true })
      expect(vim.enabled).toBe(false)
      // Internal mode starts as insert due to config
      expect(vim._internalMode).toBe("insert")
      // External mode always reports insert when disabled
      expect(vim.mode).toBe("insert")
      expect(vim.isNormal).toBe(false)
      expect(vim.isInsert).toBe(true)
    })

    test("enabled: false, start_in_insert: false", () => {
      const vim = createVimState({ enabled: false, start_in_insert: false })
      expect(vim.enabled).toBe(false)
      // Internal mode starts as normal
      expect(vim._internalMode).toBe("normal")
      // But external mode always reports insert when disabled
      expect(vim.mode).toBe("insert")
      expect(vim.isNormal).toBe(false)
      expect(vim.isInsert).toBe(true)
    })
  })
})

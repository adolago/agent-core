import { BoxRenderable, TextareaRenderable, MouseEvent, PasteEvent, t, dim, fg } from "@opentui/core"
import { createEffect, createMemo, type JSX, onMount, createSignal, onCleanup, Show, Switch, Match } from "solid-js"
import "opentui-spinner/solid"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"
import { EmptyBorder } from "@tui/component/border"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { Identifier } from "@/id/id"
import { createStore, produce } from "solid-js/store"
import { useKeybind } from "@tui/context/keybind"
import { usePromptHistory, type PromptInfo } from "./history"
import { usePromptStash } from "./stash"
import { DialogStash } from "../dialog-stash"
import { type AutocompleteRef, Autocomplete } from "./autocomplete"
import { useCommandDialog } from "../dialog-command"
import { useRenderer } from "@opentui/solid"
import { Editor } from "@tui/util/editor"
import { useExit } from "../../context/exit"
import { Clipboard } from "../../util/clipboard"
import type { FilePart } from "@opencode-ai/sdk/v2"
import { TuiEvent } from "../../event"
import { iife } from "@/util/iife"
import { Locale } from "@/util/locale"
import { formatDuration } from "@/util/format"
import { createColors, createFrames } from "../../ui/spinner.ts"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogProvider as DialogProviderConnect } from "../dialog-provider"
import { DialogAlert } from "../../ui/dialog-alert"
import { useToast } from "../../ui/toast"
import { useKV } from "../../context/kv"
import { useTextareaKeybindings } from "../textarea-keybindings"
import { Dictation } from "@tui/util/dictation"
import { DialogGrammar } from "../dialog-grammar"
import { Grammar } from "../../util/grammar"
import { createGrammarChecker, type GrammarError } from "../../util/grammar-realtime"

export type PromptProps = {
  sessionID?: string
  visible?: boolean
  disabled?: boolean
  onSubmit?: () => void
  ref?: (ref: PromptRef) => void
  hint?: JSX.Element
  showPlaceholder?: boolean
}

export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}

const PLACEHOLDERS = ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"]

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable
  let autocomplete: AutocompleteRef

  const keybind = useKeybind()
  const local = useLocal()
  const sdk = useSDK()
  const route = useRoute()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const status = createMemo(() => sync.data.session_status?.[props.sessionID ?? ""] ?? { type: "idle" })
  const history = usePromptHistory()
  const stash = usePromptStash()
  const command = useCommandDialog()
  const renderer = useRenderer()
  const { theme, syntax } = useTheme()
  const kv = useKV()
  const [dictationConfig, setDictationConfig] = createSignal<Dictation.RuntimeConfig | undefined>(undefined)
  createEffect(() => {
    const tui = sync.data.config.tui as { dictation?: Dictation.Config } | undefined
    Dictation.resolveConfig(tui?.dictation).then(setDictationConfig)
  })
  const [dictationState, setDictationState] = createSignal<Dictation.State>("idle")
  let dictationRecording: Dictation.RecordingHandle | undefined
  const dictationKey = createMemo(() => keybind.print("input_dictation_toggle"))
  const dictationCommandLabel = createMemo(() => {
    const state = dictationState()
    if (state === "listening") return "Stop dictation"
    if (state === "sending") return "Dictation (sending)"
    if (state === "receiving") return "Dictation (receiving)"
    if (state === "transcribing") return "Dictation (processing)"
    return "Start dictation"
  })
  const dictationCommandDisabled = createMemo(() => {
    const state = dictationState()
    return state !== "idle" && state !== "listening"
  })
  const dictationHintLabel = createMemo(() => {
    const state = dictationState()
    if (state === "listening") return "dictate (listening)"
    if (state === "sending") return "dictate (sending)"
    if (state === "receiving") return "dictate (receiving)"
    if (state === "transcribing") return "dictate (processing)"
    return "dictate"
  })
  const dictationHintColor = createMemo(() => {
    const state = dictationState()
    if (state === "listening") return theme.warning
    if (state === "sending" || state === "receiving" || state === "transcribing") return theme.primary
    return theme.text
  })

  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: "Connect a provider to send prompts",
      duration: 3000,
    })
    if (sync.data?.provider?.length ?? 0 === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }

  const textareaKeybindings = useTextareaKeybindings()

  // Track incomplete todos for hint display
  const incompleteTodos = createMemo(() => {
    if (!props.sessionID) return []
    const todos = sync.data?.todo?.[props.sessionID] ?? []
    return todos.filter((t) => t.status !== "completed" && t.status !== "cancelled")
  })

  const todoHint = createMemo(() => {
    const incomplete = incompleteTodos()
    if (incomplete.length === 0) return null
    const todos = sync.data?.todo?.[props.sessionID ?? ""] ?? []
    const completed = todos.filter((t) => t.status === "completed").length
    const inProgress = incomplete.find((t) => t.status === "in_progress")
    return {
      count: incomplete.length,
      completed,
      total: todos.length,
      current: inProgress?.content?.slice(0, 30) ?? incomplete[0]?.content?.slice(0, 30),
    }
  })

  function insertDictationText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const prefix = input.plainText.length > 0 && !/\s$/.test(input.plainText) ? " " : ""
    input.insertText(prefix + trimmed)
    setTimeout(() => {
      input.getLayoutNode().markDirty()
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  }

  async function startDictation() {
    if (props.disabled) return
    if (store.mode !== "normal") {
      toast.show({ variant: "warning", message: "Dictation is only available in prompt mode" })
      return
    }
    const config = dictationConfig()
    if (!config) {
      toast.show({
        variant: "warning",
        message: "Dictation is not configured. Connect Inworld AI in Settings or set INWORLD_API_KEY and INWORLD_STT_ENDPOINT.",
      })
      return
    }
    if (dictationState() !== "idle") return

    const recorder = Dictation.resolveRecorderCommand({
      sampleRate: config.sampleRate,
      command: config.recordCommand,
    })
    if (!recorder) {
      toast.show({
        variant: "warning",
        message: "No recorder found. Install arecord or set tui.dictation.record_command.",
      })
      return
    }
    try {
      dictationRecording = Dictation.startRecording({ command: recorder })
    } catch (error) {
      toast.show({
        variant: "error",
        message: `Failed to start dictation: ${error instanceof Error ? error.message : String(error)}`,
      })
      return
    }
    setDictationState("listening")
    input.focus()
  }

  async function stopDictation() {
    if (dictationState() !== "listening") return
    const config = dictationConfig()
    const activeRecording = dictationRecording
    dictationRecording = undefined
    if (!activeRecording || !config) {
      setDictationState("idle")
      return
    }
    setDictationState("sending")

    try {
      const result = await activeRecording.stop()
      if (result.audio.length === 0) {
        const message = result.stderr ? `Dictation recorder error: ${result.stderr}` : "No audio captured"
        toast.show({ variant: "warning", message })
        setDictationState("idle")
        return
      }
      const transcript = await Dictation.transcribe({
        config,
        audio: result.audio,
        onState: (state) => setDictationState(state),
      })
      if (!transcript || transcript.trim().length === 0) {
        toast.show({ variant: "warning", message: "No transcript returned from dictation" })
        setDictationState("idle")
        return
      }
      insertDictationText(transcript)
      setDictationState("idle")
      if (config.autoSubmit) {
        setTimeout(() => submit(), 0)
      }
    } catch (error) {
      toast.show({
        variant: "error",
        message: `Dictation failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      setDictationState("idle")
    }
  }

  async function toggleDictation() {
    if (dictationState() === "idle") {
      await startDictation()
      return
    }
    if (dictationState() === "listening") {
      await stopDictation()
      return
    }
    toast.show({ variant: "info", message: "Dictation is still processing" })
  }

  onCleanup(() => {
    if (dictationRecording) {
      dictationRecording.cancel().catch(() => {})
      dictationRecording = undefined
    }
    grammarChecker.cancel()
  })
  const fileStyleId = syntax().getStyleId("extmark.file")!
  const agentStyleId = syntax().getStyleId("extmark.agent")!
  const pasteStyleId = syntax().getStyleId("extmark.paste")!
  const grammarStyleId = syntax().getStyleId("extmark.error.grammar")!
  const spellingStyleId = syntax().getStyleId("extmark.error.spelling")!
  const styleErrorStyleId = syntax().getStyleId("extmark.error.style")!
  let promptPartTypeId = 0
  let grammarErrorTypeId = 0

  // Real-time grammar checking - enabled by default
  const [realtimeGrammarEnabled, setRealtimeGrammarEnabled] = createSignal(kv.get("realtime_grammar_enabled", true))
  const grammarChecker = createGrammarChecker({
    debounceMs: 500,
    enabled: realtimeGrammarEnabled,
    config: () => (sync.data.config as any).grammar,
  })

  function clearGrammarExtmarks() {
    if (!grammarErrorTypeId) return
    const extmarks = input.extmarks.getAllForTypeId(grammarErrorTypeId)
    for (const em of extmarks) {
      input.extmarks.delete(em.id)
    }
  }

  function syncGrammarExtmarks(errors: GrammarError[]) {
    if (!grammarErrorTypeId) return

    // Clear previous grammar extmarks
    clearGrammarExtmarks()

    for (const error of errors) {
      const styleId =
        error.category === "spelling" ? spellingStyleId : error.category === "style" ? styleErrorStyleId : grammarStyleId

      input.extmarks.create({
        start: error.start,
        end: error.end,
        virtual: false,
        styleId,
        typeId: grammarErrorTypeId,
        data: error,
      })
    }
  }

  // Update grammar extmarks when errors change
  createEffect(() => {
    const errors = grammarChecker.errors()
    if (realtimeGrammarEnabled()) {
      syncGrammarExtmarks(errors)
    }
  })

  sdk.event.on(TuiEvent.PromptAppend.type, (evt) => {
    input.insertText(evt.properties.text)
    setTimeout(() => {
      input.getLayoutNode().markDirty()
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  })

  createEffect(() => {
    if (props.disabled) input.cursorColor = theme.backgroundElement
    if (!props.disabled) input.cursorColor = theme.text
  })

  const lastUserMessage = createMemo(() => {
    if (!props.sessionID) return undefined
    const messages = sync.data?.message?.[props.sessionID]
    if (!messages) return undefined
    return messages.findLast((m) => m.role === "user")
  })

  const [store, setStore] = createStore<{
    prompt: PromptInfo
    mode: "normal" | "shell"
    extmarkToPartIndex: Map<number, number>
    interrupt: number
    placeholder: number
  }>({
    placeholder: Math.floor(Math.random() * PLACEHOLDERS.length),
    prompt: {
      input: "",
      parts: [],
    },
    mode: "normal",
    extmarkToPartIndex: new Map(),
    interrupt: 0,
  })

  // Initialize agent/model/variant from last user message when session changes
  let syncedSessionID: string | undefined
  createEffect(() => {
    const sessionID = props.sessionID
    const msg = lastUserMessage()

    if (sessionID !== syncedSessionID) {
      if (!sessionID || !msg) return

      syncedSessionID = sessionID

      // Only set agent if it's a primary agent (not a subagent)
      const isPrimaryAgent = local.agent.list().some((x) => x.name === msg.agent)
      if (msg.agent && isPrimaryAgent) {
        local.agent.set(msg.agent)
        if (msg.model) local.model.set(msg.model)
        if (msg.variant) local.model.variant.set(msg.variant)
      }
    }
  })

  command.register(() => {
    return [
      {
        title: "Clear prompt",
        value: "prompt.clear",
        category: "Prompt",
        hidden: true,
        onSelect: (dialog) => {
          input.extmarks.clear()
          input.clear()
          dialog.clear()
        },
      },
      {
        title: "Submit prompt",
        value: "prompt.submit",
        keybind: "input_submit",
        category: "Prompt",
        hidden: true,
        onSelect: (dialog) => {
          if (!input.focused) return
          submit()
          dialog.clear()
        },
      },
      {
        title: "Paste",
        value: "prompt.paste",
        keybind: "input_paste",
        category: "Prompt",
        hidden: true,
        onSelect: async () => {
          const content = await Clipboard.read()
          if (content?.mime.startsWith("image/")) {
            await pasteImage({
              filename: "clipboard",
              mime: content.mime,
              content: content.data,
            })
          }
        },
      },
      {
        title: dictationCommandLabel(),
        value: "prompt.dictation.toggle",
        keybind: "input_dictation_toggle",
        category: "Prompt",
        disabled: dictationCommandDisabled(),
        onSelect: async (dialog) => {
          await toggleDictation()
          dialog.clear()
        },
      },
      {
        title: "Interrupt session",
        value: "session.interrupt",
        keybind: "session_interrupt",
        category: "Session",
        hidden: true,
        enabled: status().type !== "idle",
        onSelect: (dialog) => {
          if (autocomplete.visible) return
          if (!input.focused) return
          // FUTURE: Shell mode toggle should be its own registered command
          // for better discoverability in the command palette
          if (store.mode === "shell") {
            setStore("mode", "normal")
            return
          }
          if (!props.sessionID) return

          setStore("interrupt", store.interrupt + 1)

          setTimeout(() => {
            setStore("interrupt", 0)
          }, 5000)

          if (store.interrupt >= 2) {
            sdk.client.session.abort({
              sessionID: props.sessionID,
            })
            setStore("interrupt", 0)
          }
          dialog.clear()
        },
      },
      {
        title: "Open editor",
        category: "Session",
        keybind: "editor_open",
        value: "prompt.editor",
        slash: {
          name: "editor",
        },
        onSelect: async (dialog) => {
          dialog.clear()

          // replace summarized text parts with the actual text
          const text = store.prompt.parts
            .filter((p) => p.type === "text")
            .reduce((acc, p) => {
              if (!p.source) return acc
              return acc.replace(p.source.text.value, p.text)
            }, store.prompt.input)

          const nonTextParts = store.prompt.parts.filter((p) => p.type !== "text")

          const value = text
          const content = await Editor.open({ value, renderer })
          if (!content) return

          input.setText(content)

          // Update positions for nonTextParts based on their location in new content
          // Filter out parts whose virtual text was deleted
          // this handles a case where the user edits the text in the editor
          // such that the virtual text moves around or is deleted
          const updatedNonTextParts = nonTextParts
            .map((part) => {
              let virtualText = ""
              if (part.type === "file" && part.source?.text) {
                virtualText = part.source.text.value
              } else if (part.type === "agent" && part.source) {
                virtualText = part.source.value
              }

              if (!virtualText) return part

              const newStart = content.indexOf(virtualText)
              // if the virtual text is deleted, remove the part
              if (newStart === -1) return null

              const newEnd = newStart + virtualText.length

              if (part.type === "file" && part.source?.text) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    text: {
                      ...part.source.text,
                      start: newStart,
                      end: newEnd,
                    },
                  },
                }
              }

              if (part.type === "agent" && part.source) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    start: newStart,
                    end: newEnd,
                  },
                }
              }

              return part
            })
            .filter((part) => part !== null)

          setStore("prompt", {
            input: content,
            // keep only the non-text parts because the text parts were
            // already expanded inline
            parts: updatedNonTextParts,
          })
          restoreExtmarksFromParts(updatedNonTextParts)
          input.cursorOffset = Bun.stringWidth(content)
        },
      },
      {
        title: "Check grammar",
        value: "prompt.grammar",
        category: "Prompt",
        disabled: !store.prompt.input,
        onSelect: async (d) => {
          if (!store.prompt.input) return
          d.clear()
          
          toast.show({
            variant: "info",
            message: "Checking grammar...",
            duration: 1000,
          })

          const matches = await Grammar.check(store.prompt.input, (sync.data.config as any).grammar)
          if (matches.length === 0) {
            toast.show({
              variant: "success",
              message: "No grammar errors found",
              duration: 2000,
            })
            return
          }

          dialog.replace(() => (
            <DialogGrammar
              originalText={store.prompt.input}
              matches={matches}
              onApply={(content) => {
                input.setText(content)
                
                // Try to preserve parts if possible (similar to editor logic)
                const nonTextParts = store.prompt.parts.filter((p) => p.type !== "text")
                const updatedNonTextParts = nonTextParts
                  .map((part) => {
                    let virtualText = ""
                    if (part.type === "file" && part.source?.text) {
                      virtualText = part.source.text.value
                    } else if (part.type === "agent" && part.source) {
                      virtualText = part.source.value
                    }

                    if (!virtualText) return part

                    const newStart = content.indexOf(virtualText)
                    if (newStart === -1) return null

                    const newEnd = newStart + virtualText.length

                    if (part.type === "file" && part.source?.text) {
                      return {
                        ...part,
                        source: {
                          ...part.source,
                          text: {
                            ...part.source.text,
                            start: newStart,
                            end: newEnd,
                          },
                        },
                      }
                    }

                    if (part.type === "agent" && part.source) {
                      return {
                        ...part,
                        source: {
                          ...part.source,
                          start: newStart,
                          end: newEnd,
                        },
                      }
                    }

                    return part
                  })
                  .filter((part) => part !== null)

                setStore("prompt", {
                  input: content,
                  parts: updatedNonTextParts,
                })
                restoreExtmarksFromParts(updatedNonTextParts)
                input.cursorOffset = Bun.stringWidth(content)
              }}
            />
          ))
        }
      },
      {
        title: realtimeGrammarEnabled() ? "Disable real-time grammar" : "Enable real-time grammar",
        value: "prompt.grammar.realtime",
        category: "Prompt",
        onSelect: (d) => {
          const newValue = !realtimeGrammarEnabled()
          setRealtimeGrammarEnabled(newValue)
          kv.set("realtime_grammar_enabled", newValue)
          if (!newValue) {
            // Clear grammar extmarks when disabling
            grammarChecker.clear()
            clearGrammarExtmarks()
          } else {
            // Trigger check immediately when enabling
            grammarChecker.check(store.prompt.input)
          }
          toast.show({
            variant: "info",
            message: newValue ? "Real-time grammar checking enabled" : "Real-time grammar checking disabled",
            duration: 2000,
          })
          d.clear()
        },
      },
      {
        title: "Fix grammar error at cursor",
        value: "prompt.grammar.quickfix",
        keybind: "grammar_quickfix",
        category: "Prompt",
        disabled: !realtimeGrammarEnabled() || grammarChecker.errors().length === 0,
        onSelect: (d) => {
          if (!grammarErrorTypeId) return
          const cursorOffset = input.cursorOffset

          // Find grammar extmark at cursor position
          const grammarExtmarks = input.extmarks.getAllForTypeId(grammarErrorTypeId)
          const errorAtCursor = grammarExtmarks.find(
            (em: { start: number; end: number; data?: GrammarError }) =>
              cursorOffset >= em.start && cursorOffset <= em.end && em.data
          )

          if (!errorAtCursor || !errorAtCursor.data) {
            toast.show({
              variant: "info",
              message: "No grammar error at cursor position",
              duration: 1500,
            })
            d.clear()
            return
          }

          const error = errorAtCursor.data as GrammarError

          if (error.replacements.length === 0) {
            toast.show({
              variant: "info",
              message: error.message,
              duration: 3000,
            })
            d.clear()
            return
          }

          // If single replacement, apply directly
          if (error.replacements.length === 1) {
            const replacement = error.replacements[0]
            const before = store.prompt.input.slice(0, error.start)
            const after = store.prompt.input.slice(error.end)
            const newText = before + replacement + after
            input.setText(newText)
            setStore("prompt", "input", newText)
            // Re-trigger grammar check
            grammarChecker.check(newText)
            toast.show({
              variant: "success",
              message: `Fixed: "${replacement}"`,
              duration: 1500,
            })
            d.clear()
            return
          }

          // Multiple replacements - show selection dialog
          d.clear()
          dialog.replace(() => (
            <DialogSelect
              title={error.shortMessage || "Quick Fix"}
              options={error.replacements.map((replacement, index) => ({
                title: replacement,
                value: index,
                description: index === 0 ? "(most likely)" : undefined,
                onSelect: () => {
                  const before = store.prompt.input.slice(0, error.start)
                  const after = store.prompt.input.slice(error.end)
                  const newText = before + replacement + after
                  input.setText(newText)
                  setStore("prompt", "input", newText)
                  // Re-trigger grammar check
                  grammarChecker.check(newText)
                },
              }))}
            />
          ))
        },
      },
    ]
  })

  const ref: PromptRef = {
    get focused() {
      return input.focused
    },
    get current() {
      return store.prompt
    },
    focus() {
      input.focus()
    },
    blur() {
      input.blur()
    },
    set(prompt) {
      input.setText(prompt.input)
      setStore("prompt", prompt)
      restoreExtmarksFromParts(prompt.parts)
      input.gotoBufferEnd()
    },
    reset() {
      input.clear()
      input.extmarks.clear()
      grammarChecker.clear()
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
    },
    submit() {
      submit()
    },
  }

  createEffect(() => {
    if (props.visible !== false) input?.focus()
    if (props.visible === false) input?.blur()
  })

  function restoreExtmarksFromParts(parts: PromptInfo["parts"]) {
    input.extmarks.clear()
    setStore("extmarkToPartIndex", new Map())

    parts.forEach((part, partIndex) => {
      let start = 0
      let end = 0
      let virtualText = ""
      let styleId: number | undefined

      if (part.type === "file" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = fileStyleId
      } else if (part.type === "agent" && part.source) {
        start = part.source.start
        end = part.source.end
        virtualText = part.source.value
        styleId = agentStyleId
      } else if (part.type === "text" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = pasteStyleId
      }

      if (virtualText) {
        const extmarkId = input.extmarks.create({
          start,
          end,
          virtual: true,
          styleId,
          typeId: promptPartTypeId,
        })
        setStore("extmarkToPartIndex", (map: Map<number, number>) => {
          const newMap = new Map(map)
          newMap.set(extmarkId, partIndex)
          return newMap
        })
      }
    })
  }

  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    setStore(
      produce((draft) => {
        const newMap = new Map<number, number>()
        const newParts: typeof draft.prompt.parts = []

        for (const extmark of allExtmarks) {
          const partIndex = draft.extmarkToPartIndex.get(extmark.id)
          if (partIndex !== undefined) {
            const part = draft.prompt.parts[partIndex]
            if (part) {
              if (part.type === "agent" && part.source) {
                part.source.start = extmark.start
                part.source.end = extmark.end
              } else if (part.type === "file" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              } else if (part.type === "text" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              }
              newMap.set(extmark.id, newParts.length)
              newParts.push(part)
            }
          }
        }

        draft.extmarkToPartIndex = newMap
        draft.prompt.parts = newParts
      }),
    )
  }

  command.register(() => [
    {
      title: "Stash prompt",
      value: "prompt.stash",
      category: "Prompt",
      enabled: !!store.prompt.input,
      onSelect: (dialog) => {
        if (!store.prompt.input) return
        stash.push({
          input: store.prompt.input,
          parts: store.prompt.parts,
        })
        input.extmarks.clear()
        input.clear()
        setStore("prompt", { input: "", parts: [] })
        setStore("extmarkToPartIndex", new Map())
        dialog.clear()
      },
    },
    {
      title: "Stash pop",
      value: "prompt.stash.pop",
      category: "Prompt",
      enabled: stash.list().length > 0,
      onSelect: (dialog) => {
        const entry = stash.pop()
        if (entry) {
          input.setText(entry.input)
          setStore("prompt", { input: entry.input, parts: entry.parts })
          restoreExtmarksFromParts(entry.parts)
          input.gotoBufferEnd()
        }
        dialog.clear()
      },
    },
    {
      title: "Stash list",
      value: "prompt.stash.list",
      category: "Prompt",
      enabled: stash.list().length > 0,
      onSelect: (dialog) => {
        dialog.replace(() => (
          <DialogStash
            onSelect={(entry) => {
              input.setText(entry.input)
              setStore("prompt", { input: entry.input, parts: entry.parts })
              restoreExtmarksFromParts(entry.parts)
              input.gotoBufferEnd()
            }}
          />
        ))
      },
    },
  ])

  async function submit() {
    if (props.disabled) return
    if (autocomplete?.visible) return
    if (!store.prompt.input) return
    const trimmed = store.prompt.input.trim()
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      exit()
      return
    }
    const selectedModel = local.model.current()
    if (!selectedModel) {
      promptModelWarning()
      return
    }
    const sessionID = props.sessionID
      ? props.sessionID
      : await (async () => {
          const sessionID = await sdk.client.session.create({}).then((x) => x.data!.id)
          return sessionID
        })()
    const messageID = Identifier.ascending("message")
    let inputText = store.prompt.input

    // Expand pasted text inline before submitting
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    const sortedExtmarks = allExtmarks.sort((a: { start: number }, b: { start: number }) => b.start - a.start)

    for (const extmark of sortedExtmarks) {
      const partIndex = store.extmarkToPartIndex.get(extmark.id)
      if (partIndex !== undefined) {
        const part = store.prompt.parts[partIndex]
        if (part?.type === "text" && part.text) {
          const before = inputText.slice(0, extmark.start)
          const after = inputText.slice(extmark.end)
          inputText = before + part.text + after
        }
      }
    }

    // Filter out text parts (pasted content) since they're now expanded inline
    const nonTextParts = store.prompt.parts.filter((part) => part.type !== "text")

    // Capture mode before it gets reset
    const currentMode = store.mode
    const variant = local.model.variant.current()

    if (store.mode === "shell") {
      sdk.client.session.shell({
        sessionID,
        agent: local.agent.current().name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        command: inputText,
      })
      setStore("mode", "normal")
    } else if (
      iife(() => {
        const prefix = inputText.startsWith(":") ? ":" : inputText.startsWith("/") ? "/" : undefined
        if (!prefix) return false
        const firstLine = inputText.split("\n")[0]
        const command = firstLine.split(" ")[0].slice(1)
        return sync.data?.command?.some((x) => x.id === command)
      })
    ) {
      // Parse command from first line, preserve multi-line content in arguments
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [command, ...firstLineArgs] = firstLine.split(" ")
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")

      sdk.client.session.command({
        sessionID,
        command: command.slice(1),
        arguments: args,
        agent: local.agent.current().name,
        model: `${selectedModel.providerID}/${selectedModel.modelID}`,
        messageID,
        variant,
        parts: nonTextParts
          .filter((x) => x.type === "file")
          .map((x) => ({
            id: Identifier.ascending("part"),
            ...x,
          })),
      })
    } else {
      sdk.client.session
        .prompt({
          sessionID,
          ...selectedModel,
          messageID,
          agent: local.agent.current().name,
          model: selectedModel,
          variant,
          parts: [
            {
              id: Identifier.ascending("part"),
              type: "text",
              text: inputText,
            },
            ...nonTextParts.map((x) => ({
              id: Identifier.ascending("part"),
              ...x,
            })),
          ],
        })
        .catch(() => {})
    }
    history.append({
      ...store.prompt,
      mode: currentMode,
    })
    input.extmarks.clear()
    grammarChecker.clear()
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
    props.onSubmit?.()

    // temporary hack to make sure the message is sent
    if (!props.sessionID)
      setTimeout(() => {
        route.navigate({
          type: "session",
          sessionID,
        })
      }, 50)
    input.clear()
  }
  const exit = useExit()

  function pasteText(text: string, virtualText: string) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const extmarkEnd = extmarkStart + virtualText.length

    input.insertText(virtualText + " ")

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push({
          type: "text" as const,
          text,
          source: {
            text: {
              start: extmarkStart,
              end: extmarkEnd,
              value: virtualText,
            },
          },
        })
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
  }

  async function pasteImage(file: { filename?: string; content: string; mime: string }) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const count = store.prompt.parts.filter((x) => x.type === "file").length
    const virtualText = `[Image ${count + 1}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    const part: Omit<FilePart, "id" | "messageID" | "sessionID"> = {
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: `data:${file.mime};base64,${file.content}`,
      source: {
        type: "file",
        path: file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText,
        },
      },
    }
    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push(part)
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
    return
  }

  const highlight = createMemo(() => {
    if (keybind.leader) return theme.border
    if (store.mode === "shell") return theme.primary
    return local.agent.color(local.agent.current().name)
  })

  const showVariant = createMemo(() => {
    const variants = local.model.variant.list()
    if (variants.length === 0) return false
    const current = local.model.variant.current()
    return !!current
  })

  const spinnerDef = createMemo(() => {
    const color = local.agent.color(local.agent.current().name)
    return {
      frames: createFrames({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3,
      }),
      color: createColors({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3,
      }),
    }
  })

  return (
    <>
      <Autocomplete
        sessionID={props.sessionID}
        ref={(r) => (autocomplete = r)}
        anchor={() => anchor}
        input={() => input}
        setPrompt={(cb) => {
          setStore("prompt", produce(cb))
        }}
        setExtmark={(partIndex, extmarkId) => {
          setStore("extmarkToPartIndex", (map: Map<number, number>) => {
            const newMap = new Map(map)
            newMap.set(extmarkId, partIndex)
            return newMap
          })
        }}
        value={store.prompt.input}
        fileStyleId={fileStyleId}
        agentStyleId={agentStyleId}
        promptPartTypeId={() => promptPartTypeId}
      />
      <box ref={(r) => (anchor = r)} visible={props.visible !== false}>
        <box
          border={["left"]}
          borderColor={highlight()}
          customBorderChars={{
            ...EmptyBorder,
            vertical: "┃",
            bottomLeft: "╹",
          }}
        >
          <box
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            flexShrink={0}
            backgroundColor={theme.backgroundElement}
            flexGrow={1}
          >
            <textarea
              placeholder={props.sessionID ? undefined : `Ask anything... "${PLACEHOLDERS[store.placeholder]}"`}
              textColor={keybind.leader ? theme.textMuted : theme.text}
              focusedTextColor={keybind.leader ? theme.textMuted : theme.text}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                const value = input.plainText
                setStore("prompt", "input", value)
                autocomplete.onInput(value)
                syncExtmarksWithPromptParts()
                // Trigger real-time grammar check
                if (realtimeGrammarEnabled()) {
                  grammarChecker.check(value)
                }
              }}
              keyBindings={textareaKeybindings()}
              onKeyDown={async (e) => {
                if (props.disabled) {
                  e.preventDefault()
                  return
                }
                // Handle clipboard paste (Ctrl+V) - check for images first on Windows
                // This is needed because Windows terminal doesn't properly send image data
                // through bracketed paste, so we need to intercept the keypress and
                // directly read from clipboard before the terminal handles it
                if (keybind.match("input_paste", e)) {
                  const content = await Clipboard.read()
                  if (content?.mime.startsWith("image/")) {
                    e.preventDefault()
                    await pasteImage({
                      filename: "clipboard",
                      mime: content.mime,
                      content: content.data,
                    })
                    return
                  }
                  // If no image, let the default paste behavior continue
                }
                if (keybind.match("input_dictation_toggle", e)) {
                  e.preventDefault()
                  await toggleDictation()
                  return
                }
                // Handle grammar quick-fix (Ctrl+.)
                if (keybind.match("grammar_quickfix", e) && realtimeGrammarEnabled() && grammarErrorTypeId) {
                  e.preventDefault()
                  command.trigger("prompt.grammar.quickfix")
                  return
                }
                if (keybind.match("input_clear", e) && store.prompt.input !== "") {
                  input.clear()
                  input.extmarks.clear()
                  setStore("prompt", {
                    input: "",
                    parts: [],
                  })
                  setStore("extmarkToPartIndex", new Map())
                  return
                }
                if (keybind.match("app_exit", e)) {
                  if (store.prompt.input === "") {
                    await exit()
                    // Don't preventDefault - let textarea potentially handle the event
                    e.preventDefault()
                    return
                  }
                }
                if (e.name === "!" && input.visualCursor.offset === 0) {
                  setStore("mode", "shell")
                  e.preventDefault()
                  return
                }
                if (store.mode === "shell") {
                  if ((e.name === "backspace" && input.visualCursor.offset === 0) || e.name === "escape") {
                    setStore("mode", "normal")
                    e.preventDefault()
                    return
                  }
                }
                if (store.mode === "normal") autocomplete.onKeyDown(e)
                if (!autocomplete.visible) {
                  if (
                    (keybind.match("history_previous", e) && input.cursorOffset === 0) ||
                    (keybind.match("history_next", e) && input.cursorOffset === input.plainText.length)
                  ) {
                    const direction = keybind.match("history_previous", e) ? -1 : 1
                    const item = history.move(direction, input.plainText)

                    if (item) {
                      input.setText(item.input)
                      setStore("prompt", item)
                      setStore("mode", item.mode ?? "normal")
                      restoreExtmarksFromParts(item.parts)
                      e.preventDefault()
                      if (direction === -1) input.cursorOffset = 0
                      if (direction === 1) input.cursorOffset = input.plainText.length
                    }
                    return
                  }

                  if (keybind.match("history_previous", e) && input.visualCursor.visualRow === 0) input.cursorOffset = 0
                  if (keybind.match("history_next", e) && input.visualCursor.visualRow === input.height - 1)
                    input.cursorOffset = input.plainText.length
                }
              }}
              onSubmit={submit}
              onPaste={async (event: PasteEvent) => {
                if (props.disabled) {
                  event.preventDefault()
                  return
                }

                // Normalize line endings at the boundary
                // Windows ConPTY/Terminal often sends CR-only newlines in bracketed paste
                // Replace CRLF first, then any remaining CR
                const normalizedText = event.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                const pastedContent = normalizedText.trim()
                if (!pastedContent) {
                  command.trigger("prompt.paste")
                  return
                }

                // trim ' from the beginning and end of the pasted content. just
                // ' and nothing else
                const filepath = pastedContent.replace(/^'+|'+$/g, "").replace(/\\ /g, " ")
                const isUrl = /^(https?):\/\//.test(filepath)
                if (!isUrl) {
                  try {
                    const file = Bun.file(filepath)
                    // Handle SVG as raw text content, not as base64 image
                    if (file.type === "image/svg+xml") {
                      event.preventDefault()
                      const content = await file.text().catch(() => {})
                      if (content) {
                        pasteText(content, `[SVG: ${file.name ?? "image"}]`)
                        return
                      }
                    }
                    if (file.type.startsWith("image/")) {
                      event.preventDefault()
                      const content = await file
                        .arrayBuffer()
                        .then((buffer) => Buffer.from(buffer).toString("base64"))
                        .catch(() => {})
                      if (content) {
                        await pasteImage({
                          filename: file.name,
                          mime: file.type,
                          content,
                        })
                        return
                      }
                    }
                  } catch {}
                }

                const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1
                if (
                  (lineCount >= 3 || pastedContent.length > 150) &&
                  !sync.data?.config?.experimental?.disable_paste_summary
                ) {
                  event.preventDefault()
                  pasteText(pastedContent, `[Pasted ~${lineCount} lines]`)
                  return
                }

                // Force layout update and render for the pasted content
                setTimeout(() => {
                  input.getLayoutNode().markDirty()
                  renderer.requestRender()
                }, 0)
              }}
              ref={(r: TextareaRenderable) => {
                input = r
                if (promptPartTypeId === 0) {
                  promptPartTypeId = input.extmarks.registerType("prompt-part")
                }
                if (grammarErrorTypeId === 0) {
                  grammarErrorTypeId = input.extmarks.registerType("grammar-error")
                }
                props.ref?.(ref)
                setTimeout(() => {
                  input.cursorColor = theme.text
                }, 0)
              }}
              onMouseDown={(r: MouseEvent) => r.target?.focus()}
              focusedBackgroundColor={theme.backgroundElement}
              cursorColor={theme.text}
              syntaxStyle={syntax()}
            />
            <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1}>
              <text fg={highlight()}>
                {store.mode === "shell" ? "Shell" : Locale.titlecase(local.agent.current().name)}{" "}
              </text>
              <Show when={store.mode === "normal"}>
                <text fg={local.mode.isHold() ? theme.warning : theme.success}>{local.mode.isHold() ? "▣" : "▢"}</text>
              </Show>
              <Show when={store.mode === "normal"}>
                <box flexDirection="row" gap={1}>
                  <text flexShrink={0} fg={keybind.leader ? theme.textMuted : theme.text}>
                    {local.model.parsed().model}
                  </text>
                  <text fg={theme.textMuted}>{local.model.parsed().provider}</text>
                  <Show when={local.model.isFallbackActive()}>
                    <text>
                      <span style={{ fg: theme.warning, bold: true }}>[FB]</span>
                    </text>
                  </Show>
                  <Show when={showVariant()}>
                    <text fg={theme.textMuted}>·</text>
                    <text>
                      <span style={{ fg: theme.warning, bold: true }}>{local.model.variant.current()}</span>
                    </text>
                  </Show>
                </box>
              </Show>
            </box>
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={highlight()}
          customBorderChars={{
            ...EmptyBorder,
            vertical: theme.backgroundElement.a !== 0 ? "╹" : " ",
          }}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={theme.backgroundElement}
            customBorderChars={
              theme.backgroundElement.a !== 0
                ? {
                    ...EmptyBorder,
                    horizontal: "▀",
                  }
                : {
                    ...EmptyBorder,
                    horizontal: " ",
                  }
            }
          />
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <Show
            when={status().type !== "idle"}
            fallback={
              <Switch>
                <Match when={dictationState() === "listening"}>
                  <text fg={theme.warning}>
                    [REC] listening{dictationKey() ? ` (${dictationKey()} stop)` : ""}...
                  </text>
                </Match>
                <Match when={dictationState() === "sending"}>
                  <text fg={theme.primary}>[SEND] sending audio...</text>
                </Match>
                <Match when={dictationState() === "receiving"}>
                  <text fg={theme.primary}>[RECV] receiving transcript...</text>
                </Match>
                <Match when={dictationState() === "transcribing"}>
                  <text fg={theme.textMuted}>dictation processing...</text>
                </Match>
                <Match when={todoHint()}>
                  {(hint) => (
                    <text fg={theme.warning}>
                      ◐ {hint().count} pending · {hint().current}...
                    </text>
                  )}
                </Match>
              </Switch>
            }
          >
            <box
              flexDirection="row"
              gap={1}
              flexGrow={1}
              justifyContent={status().type === "retry" ? "space-between" : "flex-start"}
            >
              <box flexShrink={0} flexDirection="row" gap={1}>
                <box marginLeft={1}>
                  <Show when={kv.get("animations_enabled", true)} fallback={<text fg={theme.textMuted}>[⋯]</text>}>
                    <spinner color={spinnerDef().color} frames={spinnerDef().frames} interval={40} />
                  </Show>
                </box>
                <box flexDirection="row" gap={1} flexShrink={0}>
                  {(() => {
                    const retry = createMemo(() => {
                      const s = status()
                      if (s.type !== "retry") return
                      return s
                    })
                    const message = createMemo(() => {
                      const r = retry()
                      if (!r) return
                      if (r.message.includes("exceeded your current quota") && r.message.includes("gemini"))
                        return "gemini is way too hot right now"
                      if (r.message.length > 80) return r.message.slice(0, 80) + "..."
                      return r.message
                    })
                    const isTruncated = createMemo(() => {
                      const r = retry()
                      if (!r) return false
                      return r.message.length > 120
                    })
                    const [seconds, setSeconds] = createSignal(0)
                    onMount(() => {
                      const timer = setInterval(() => {
                        const next = retry()?.next
                        if (next) setSeconds(Math.round((next - Date.now()) / 1000))
                      }, 1000)

                      onCleanup(() => {
                        clearInterval(timer)
                      })
                    })
                    const handleMessageClick = () => {
                      const r = retry()
                      if (!r) return
                      if (isTruncated()) {
                        DialogAlert.show(dialog, "Retry Error", r.message)
                      }
                    }

                    const retryText = () => {
                      const r = retry()
                      if (!r) return ""
                      const baseMessage = message()
                      const truncatedHint = isTruncated() ? " (click to expand)" : ""
                      const duration = formatDuration(seconds())
                      const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`
                      return baseMessage + truncatedHint + retryInfo
                    }

                    return (
                      <Show when={retry()}>
                        <box onMouseUp={handleMessageClick}>
                          <text fg={theme.error}>{retryText()}</text>
                        </box>
                      </Show>
                    )
                  })()}
                </box>
              </box>
              <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                esc{" "}
                <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                  {store.interrupt > 0 ? "again to interrupt" : "interrupt"}
                </span>
              </text>
            </box>
          </Show>
          <Show when={status().type !== "retry"}>
            <box gap={2} flexDirection="row">
              <Switch>
                <Match when={store.mode === "normal"}>
                  <Show when={local.model.variant.list().length > 0}>
                    <text fg={theme.text}>
                      {keybind.print("variant_cycle")} <span style={{ fg: theme.textMuted }}>variants</span>
                    </text>
                  </Show>
                  <text fg={theme.text}>
                    {keybind.print("agent_cycle")} <span style={{ fg: theme.textMuted }}>agents</span>
                  </text>
                  <text fg={theme.text}>
                    {keybind.print("command_list")} <span style={{ fg: theme.textMuted }}>commands</span>
                  </text>
                  <Show when={dictationKey() && dictationConfig()}>
                    <text fg={dictationHintColor()}>
                      {dictationKey()} <span style={{ fg: theme.textMuted }}>{dictationHintLabel()}</span>
                    </text>
                  </Show>
                  <Show when={realtimeGrammarEnabled()}>
                    <text fg={grammarChecker.errors().length > 0 ? theme.warning : theme.textMuted}>
                      {grammarChecker.loading() ? "..." : grammarChecker.errors().length > 0 ? `${grammarChecker.errors().length} errors` : ""}
                    </text>
                  </Show>
                </Match>
                <Match when={store.mode === "shell"}>
                  <text fg={theme.text}>
                    esc <span style={{ fg: theme.textMuted }}>exit shell mode</span>
                  </text>
                </Match>
              </Switch>
            </box>
          </Show>
        </box>
      </box>
    </>
  )
}

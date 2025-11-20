import { createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, flatMap, entries, filter, isDeepEqual, sortBy } from "remeda"
import { DialogSelect, type DialogSelectOption, type DialogSelectRef } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "../context/theme"

function Free() {
  const { theme } = useTheme()
  return <span style={{ fg: theme.secondary }}>Free</span>
}
const PROVIDER_PRIORITY: Record<string, number> = {
  opencode: 0,
  anthropic: 1,
  "github-copilot": 2,
  openai: 3,
  google: 4,
  openrouter: 5,
  vercel: 6,
}

export function DialogModel() {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const [ref, setRef] = createSignal<DialogSelectRef<unknown>>()

  const connected = createMemo(() =>
    sync.data.provider.some((x) => x.id !== "opencode" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )

  const showRecent = createMemo(() => !ref()?.filter && local.model.recent().length > 0 && connected())

  const options = createMemo(() => {
    return [
      ...(showRecent()
        ? local.model.recent().flatMap((item) => {
            const provider = sync.data.provider.find((x) => x.id === item.providerID)!
            if (!provider) return []
            const model = provider.models[item.modelID]
            if (!model) return []
            return [
              {
                key: item,
                value: {
                  providerID: provider.id,
                  modelID: model.id,
                },
                title: model.name ?? item.modelID,
                description: provider.name,
                category: "Recent",
                footer: model.cost?.input === 0 && provider.id === "opencode" ? <Free /> : undefined,
                onSelect: () => {
                  dialog.clear()
                  local.model.set(
                    {
                      providerID: provider.id,
                      modelID: model.id,
                    },
                    { recent: true },
                  )
                },
              },
            ]
          })
        : []),
      ...pipe(
        sync.data.provider,
        sortBy(
          (provider) => provider.id !== "opencode",
          (provider) => provider.name,
        ),
        flatMap((provider) =>
          pipe(
            provider.models,
            entries(),
            map(([model, info]) => ({
              value: {
                providerID: provider.id,
                modelID: model,
              },
              title: info.name ?? model,
              description: provider.name,
              category: connected() ? provider.name : undefined,
              footer: info.cost?.input === 0 && provider.id === "opencode" ? <Free /> : undefined,
              onSelect() {
                dialog.clear()
                local.model.set(
                  {
                    providerID: provider.id,
                    modelID: model,
                  },
                  { recent: true },
                )
              },
            })),
            filter((x) => !showRecent() || !local.model.recent().find((y) => isDeepEqual(y, x.value))),
            sortBy((x) => x.title),
          ),
        ),
      ),
      ...(!connected()
        ? pipe(
            sync.data.provider_next.all,
            map((provider) => ({
              title: provider.name,
              category: "Connect a provider",
              value: provider.id,
            })),
            sortBy((x) => PROVIDER_PRIORITY[x.value] ?? 99),
          )
        : []),
    ]
  })

  return <DialogSelect ref={setRef} title="Select model" current={local.model.current()} options={options()} />
}

import { createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect, type DialogSelectRef } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { useKeybind } from "../context/keybind"
import * as fuzzysort from "fuzzysort"

/** Get auth status indicator for a provider (placeholder for future implementation) */
function getAuthIndicator(_providerID: string): string {
  // FUTURE: Will show lock/key icons when provider_auth_status is added to sync store
  // For now, returns empty string (no indicator)
  return ""
}

export function useConnected() {
  const sync = useSync()
  return createMemo(() => sync.data.provider.length > 0)
}

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const keybind = useKeybind()
  const [ref, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => {
    if (!connected()) return false
    if (props.providerID) return false
    return true
  })

  const options = createMemo(() => {
    const q = query()
    const showSections = showExtra()
    const recents = local.model.recent()
    const recentList = showSections ? recents : []
    const recentKeys = new Set(recentList.map((item) => `${item.providerID}/${item.modelID}`))

    const recentOptions = recentList.flatMap((item: { providerID: string; modelID: string }) => {
      const provider = sync.data.provider.find((x) => x.id === item.providerID)
      if (!provider) return []
      const model = provider.models[item.modelID]
      if (!model) return []
      const authIndicator = getAuthIndicator(provider.id)
      return [
        {
          key: item,
          value: {
            providerID: provider.id,
            modelID: model.id,
          },
          title: model.name ?? item.modelID,
          description: authIndicator + provider.name,
          category: "Recent",
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

    // Filter to only show providers with credentials (connected providers)
    const connectedProviderIds = new Set(sync.data.provider_next.connected)
    const providerOptions = pipe(
      sync.data.provider,
      filter((provider) => connectedProviderIds.has(provider.id)),
      sortBy((provider) => provider.name),
      flatMap((provider) => {
        const authIndicator = getAuthIndicator(provider.id)
        return pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          map(([model, info]) => {
            const value = {
              providerID: provider.id,
              modelID: model,
            }
            const modelKey = `${value.providerID}/${value.modelID}`
            const isRecent = recentKeys.has(modelKey)
            return {
              value,
              title: info.name ?? model,
              category: connected() ? authIndicator + provider.name : undefined,
              footer: isRecent ? "recent" : undefined,
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
            }
          }),
          sortBy((x) => x.title),
        )
      }),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => {
            return {
              ...option,
              category: "Popular providers",
            }
          }),
          take(6),
        )
      : []

    // Apply fuzzy filtering to each section separately, maintaining section order
    if (q) {
      const filteredRecents = fuzzysort
        .go(q, recentOptions, { keys: ["title"] })
        .map((x) => x.obj)
        .slice(0, 5)
      const filteredProviders = fuzzysort.go(q, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj)
      const filteredPopular = fuzzysort.go(q, popularProviders, { keys: ["title"] }).map((x) => x.obj)
      return [...filteredRecents, ...filteredProviders, ...filteredPopular]
    }

    return [...recentOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((x) => x.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    if (provider()) return provider()!.name
    return "Select model"
  })

  return (
    <DialogSelect
      keybind={[
        {
          keybind: keybind.all.model_provider_list?.[0],
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
      ]}
      ref={setRef}
      onFilter={setQuery}
      skipFilter={true}
      title={title()}
      current={local.model.current()}
      options={options()}
    />
  )
}

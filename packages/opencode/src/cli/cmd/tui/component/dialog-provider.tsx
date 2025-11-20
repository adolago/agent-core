import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useSDK } from "../context/sdk"

const PROVIDER_PRIORITY: Record<string, number> = {
  opencode: 0,
  anthropic: 1,
  "github-copilot": 2,
  openai: 3,
  google: 4,
  openrouter: 5,
  vercel: 6,
}

export function createDialogProviderOptions() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const options = createMemo(() => {
    return pipe(
      sync.data.provider_next.all,
      map((provider) => ({
        title: provider.name,
        value: provider.id,
        footer: sync.data.provider_next.connected.includes(provider.id)
          ? "Connected"
          : {
              opencode: "Recommended",
              anthropic: "Claude Max or API key",
            }[provider.id],
        async onSelect() {
          const key = await DialogPrompt.show(dialog, "Enter API key")
          if (!key) return
          await sdk.client.auth.set({
            path: {
              id: provider.id,
            },
            body: {
              type: "api",
              key,
            },
          })
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          dialog.clear()
        },
      })),
      sortBy((x) => PROVIDER_PRIORITY[x.value] ?? 99),
    )
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()

  return <DialogSelect title="Connect a provider" options={options()} />
}

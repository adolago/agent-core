import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { Dialog, useDialog } from "@tui/ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"

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
          const methods = sync.data.provider_auth[provider.id]
          let index: number | null = 0
          if (methods.length > 1) {
            index = await new Promise<number | null>((resolve) => {
              dialog.replace(
                () => (
                  <DialogSelect
                    title="Select auth method"
                    options={methods.map((x, index) => ({
                      title: x.label,
                      value: index,
                      category: "Method",
                    }))}
                    onSelect={(option) => resolve(option.value)}
                  />
                ),
                () => resolve(null),
              )
            })
          }
          if (index == null) return
          const method = methods[index]

          if (method.type === "oauth") {
            const result = await sdk.client.provider.oauth.authorize({
              path: {
                id: provider.id,
              },
              body: {
                method: index,
              },
            })
            if (result.data?.method === "code") {
              await DialogPrompt.show(dialog, result.data.url + " " + result.data.instructions)
            }
          }
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

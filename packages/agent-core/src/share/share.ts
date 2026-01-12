import { Bus } from "../bus"
import { Installation } from "../installation"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Log } from "../util/log"

export namespace Share {
  const log = Log.create({ service: "share" })

  let queue: Promise<void> = Promise.resolve()
  const pending = new Map<string, any>()
  const eventUnsubscribers: Array<() => void> = []

  export async function sync(key: string, content: any) {
    if (disabled) return
    const [root, ...splits] = key.split("/")
    if (root !== "session") return
    const [sub, sessionID] = splits
    if (sub === "share") return
    const share = await Session.getShare(sessionID).catch((error) => {
      log.debug("Could not get share info", { sessionID, error: String(error) })
      return undefined
    })
    if (!share) return
    const { secret } = share
    pending.set(key, content)
    queue = queue
      .then(async () => {
        const content = pending.get(key)
        if (content === undefined) return

        pending.delete(key)

        return fetch(`${URL}/share_sync`, {
          method: "POST",
          body: JSON.stringify({
            sessionID: sessionID,
            secret,
            key: key,
            content,
          }),
        })
      })
      .then((x) => {
        if (x) {
          log.info("synced", {
            key: key,
            status: x.status,
          })
        }
      })
      .catch((error) => {
        log.error("Share sync failed", { key, error: error instanceof Error ? error.message : String(error) })
      })
  }

  export function init() {
    eventUnsubscribers.push(
      Bus.subscribe(Session.Event.Updated, async (evt) => {
        await sync("session/info/" + evt.properties.info.id, evt.properties.info)
      }),
    )
    eventUnsubscribers.push(
      Bus.subscribe(MessageV2.Event.Updated, async (evt) => {
        await sync(
          "session/message/" + evt.properties.info.sessionID + "/" + evt.properties.info.id,
          evt.properties.info,
        )
      }),
    )
    eventUnsubscribers.push(
      Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        await sync(
          "session/part/" +
            evt.properties.part.sessionID +
            "/" +
            evt.properties.part.messageID +
            "/" +
            evt.properties.part.id,
          evt.properties.part,
        )
      }),
    )
  }

  export function shutdown() {
    for (const unsub of eventUnsubscribers) {
      unsub()
    }
    eventUnsubscribers.length = 0
    log.debug("Share module shutdown complete")
  }

  export const URL =
    process.env["OPENCODE_API"] ??
    (Installation.isPreview() || Installation.isLocal() ? "https://api.dev.opencode.ai" : "https://api.opencode.ai")

  const disabled = process.env["OPENCODE_DISABLE_SHARE"] === "true" || process.env["OPENCODE_DISABLE_SHARE"] === "1"

  export async function create(sessionID: string) {
    if (disabled) return { url: "", secret: "" }
    return fetch(`${URL}/share_create`, {
      method: "POST",
      body: JSON.stringify({ sessionID: sessionID }),
    })
      .then((x) => x.json())
      .then((x) => x as { url: string; secret: string })
  }

  export async function remove(sessionID: string, secret: string) {
    if (disabled) return {}
    return fetch(`${URL}/share_delete`, {
      method: "POST",
      body: JSON.stringify({ sessionID, secret }),
    }).then((x) => x.json())
  }
}

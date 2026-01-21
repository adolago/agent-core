import { APIEvent } from "@solidjs/start"
import { config } from "~/config"
import { DownloadPlatform } from "./types"

const assetNames: Record<string, string> = {
  "darwin-aarch64-dmg": "agent-core-desktop-darwin-aarch64.dmg",
  "darwin-x64-dmg": "agent-core-desktop-darwin-x64.dmg",
  "windows-x64-nsis": "agent-core-desktop-windows-x64.exe",
  "linux-x64-deb": "agent-core-desktop-linux-amd64.deb",
  "linux-x64-appimage": "agent-core-desktop-linux-amd64.AppImage",
  "linux-x64-rpm": "agent-core-desktop-linux-x86_64.rpm",
} satisfies Record<DownloadPlatform, string>

// Doing this on the server keeps user-friendly names for select platforms.
const downloadNames: Record<string, string> = {
  "darwin-aarch64-dmg": "Agent-Core Desktop.dmg",
  "darwin-x64-dmg": "Agent-Core Desktop.dmg",
  "windows-x64-nsis": "Agent-Core Desktop Installer.exe",
} satisfies { [K in DownloadPlatform]?: string }

export async function GET({ params: { platform } }: APIEvent) {
  const assetName = assetNames[platform]
  if (!assetName) return new Response("Not Found", { status: 404 })

  const downloadBaseUrl = config.downloadBaseUrl.replace(/\/$/, "")
  if (!downloadBaseUrl) return new Response("Not Found", { status: 404 })

  const resp = await fetch(`${downloadBaseUrl}/${assetName}`, {
    cf: {
      // in case gh releases has rate limits
      cacheTtl: 60 * 5,
      cacheEverything: true,
    },
  } as any)

  const downloadName = downloadNames[platform]

  const headers = new Headers(resp.headers)
  if (downloadName) headers.set("content-disposition", `attachment; filename="${downloadName}"`)

  return new Response(resp.body, { ...resp, headers })
}

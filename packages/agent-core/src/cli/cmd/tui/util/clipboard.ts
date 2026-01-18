import { $ } from "bun"
import { platform, release } from "os"
import clipboardy from "clipboardy"
import { lazy } from "../../../../util/lazy.js"
import { tmpdir } from "os"
import path from "path"

// 4MB threshold - leave 1MB margin for the 5MB API limit
const IMAGE_SIZE_THRESHOLD = 4 * 1024 * 1024

export namespace Clipboard {
  export interface Content {
    data: string
    mime: string
  }

  /**
   * Compress an image buffer using ImageMagick if it exceeds the size threshold.
   * Returns the original buffer if compression fails or isn't needed.
   */
  async function compressImageIfNeeded(buffer: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
    if (buffer.length <= IMAGE_SIZE_THRESHOLD) {
      return { data: buffer, mime }
    }

    // Check if ImageMagick is available
    const magick = Bun.which("magick") || Bun.which("convert")
    if (!magick) {
      console.warn(`[clipboard] Image is ${(buffer.length / 1024 / 1024).toFixed(1)}MB but ImageMagick not available for compression`)
      return { data: buffer, mime }
    }

    const tmpInput = path.join(tmpdir(), `agent-core-img-in-${Date.now()}.png`)
    const tmpOutput = path.join(tmpdir(), `agent-core-img-out-${Date.now()}.jpg`)

    try {
      // Write original image to temp file
      await Bun.write(tmpInput, buffer)

      // Progressive compression: try different quality levels until under threshold
      // Start with high quality JPEG, reduce if needed
      const qualities = [85, 70, 50, 30]
      const resizeSteps = ["100%", "75%", "50%", "25%"]

      for (const resize of resizeSteps) {
        for (const quality of qualities) {
          const cmd = magick.endsWith("convert")
            ? `convert "${tmpInput}" -resize ${resize} -quality ${quality} -strip "${tmpOutput}"`
            : `magick "${tmpInput}" -resize ${resize} -quality ${quality} -strip "${tmpOutput}"`

          await $`sh -c ${cmd}`.nothrow().quiet()

          const outputFile = Bun.file(tmpOutput)
          if (await outputFile.exists()) {
            const compressed = Buffer.from(await outputFile.arrayBuffer())
            if (compressed.length <= IMAGE_SIZE_THRESHOLD && compressed.length > 0) {
              const ratio = ((1 - compressed.length / buffer.length) * 100).toFixed(0)
              console.log(`[clipboard] Compressed image: ${(buffer.length / 1024 / 1024).toFixed(1)}MB → ${(compressed.length / 1024 / 1024).toFixed(1)}MB (${ratio}% reduction, quality=${quality}, resize=${resize})`)
              return { data: compressed, mime: "image/jpeg" }
            }
          }
        }
      }

      // If all compression attempts failed, return original with warning
      console.warn(`[clipboard] Could not compress image below ${IMAGE_SIZE_THRESHOLD / 1024 / 1024}MB threshold`)
      return { data: buffer, mime }
    } catch (err) {
      console.warn(`[clipboard] Image compression failed:`, err)
      return { data: buffer, mime }
    } finally {
      // Clean up temp files
      await $`rm -f "${tmpInput}" "${tmpOutput}"`.nothrow().quiet()
    }
  }

  export async function read(): Promise<Content | undefined> {
    const os = platform()

    if (os === "darwin") {
      const tmpfile = path.join(tmpdir(), "agent-core-clipboard.png")
      try {
        await $`osascript -e 'set imageData to the clipboard as "PNGf"' -e 'set fileRef to open for access POSIX file "${tmpfile}" with write permission' -e 'set eof fileRef to 0' -e 'write imageData to fileRef' -e 'close access fileRef'`
          .nothrow()
          .quiet()
        const file = Bun.file(tmpfile)
        const buffer = Buffer.from(await file.arrayBuffer())
        const compressed = await compressImageIfNeeded(buffer, "image/png")
        return { data: compressed.data.toString("base64"), mime: compressed.mime }
      } catch {
      } finally {
        await $`rm -f "${tmpfile}"`.nothrow().quiet()
      }
    }

    if (os === "win32" || release().includes("WSL")) {
      const script =
        "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [System.Convert]::ToBase64String($ms.ToArray()) }"
      const base64 = await $`powershell.exe -NonInteractive -NoProfile -command "${script}"`.nothrow().text()
      if (base64) {
        const imageBuffer = Buffer.from(base64.trim(), "base64")
        if (imageBuffer.length > 0) {
          const compressed = await compressImageIfNeeded(imageBuffer, "image/png")
          return { data: compressed.data.toString("base64"), mime: compressed.mime }
        }
      }
    }

    if (os === "linux") {
      const wayland = await $`wl-paste -t image/png`.nothrow().arrayBuffer()
      if (wayland && wayland.byteLength > 0) {
        const buffer = Buffer.from(wayland)
        const compressed = await compressImageIfNeeded(buffer, "image/png")
        return { data: compressed.data.toString("base64"), mime: compressed.mime }
      }
      const x11 = await $`xclip -selection clipboard -t image/png -o`.nothrow().arrayBuffer()
      if (x11 && x11.byteLength > 0) {
        const buffer = Buffer.from(x11)
        const compressed = await compressImageIfNeeded(buffer, "image/png")
        return { data: compressed.data.toString("base64"), mime: compressed.mime }
      }
    }

    const text = await clipboardy.read().catch(() => {})
    if (text) {
      return { data: text, mime: "text/plain" }
    }
  }

  const getCopyMethod = lazy(() => {
    const os = platform()

    if (os === "darwin" && Bun.which("osascript")) {
      console.log("clipboard: using osascript")
      return async (text: string) => {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        await $`osascript -e 'set the clipboard to "${escaped}"'`.nothrow().quiet()
      }
    }

    if (os === "linux") {
      if (process.env["WAYLAND_DISPLAY"] && Bun.which("wl-copy")) {
        console.log("clipboard: using wl-copy")
        return async (text: string) => {
          const proc = Bun.spawn(["wl-copy"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" })
          proc.stdin.write(text)
          proc.stdin.end()
          await proc.exited.catch(() => {})
        }
      }
      if (Bun.which("xclip")) {
        console.log("clipboard: using xclip")
        return async (text: string) => {
          const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          })
          proc.stdin.write(text)
          proc.stdin.end()
          await proc.exited.catch(() => {})
        }
      }
      if (Bun.which("xsel")) {
        console.log("clipboard: using xsel")
        return async (text: string) => {
          const proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          })
          proc.stdin.write(text)
          proc.stdin.end()
          await proc.exited.catch(() => {})
        }
      }
    }

    if (os === "win32") {
      console.log("clipboard: using powershell")
      return async (text: string) => {
        // need to escape backticks because powershell uses them as escape code
        const escaped = text.replace(/"/g, '""').replace(/`/g, "``")
        await $`powershell -NonInteractive -NoProfile -Command "Set-Clipboard -Value \"${escaped}\""`.nothrow().quiet()
      }
    }

    console.log("clipboard: no native support")
    return async (text: string) => {
      await clipboardy.write(text).catch(() => {})
    }
  })

  export async function copy(text: string): Promise<void> {
    await getCopyMethod()(text)
  }
}

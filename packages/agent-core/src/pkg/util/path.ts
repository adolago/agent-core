export function getFilename(path: string | undefined) {
  if (!path) return ""
  const trimmed = path.replace(/[\/\\]+$/, "")
  const lastSlashIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  if (lastSlashIndex === -1) return trimmed
  return trimmed.slice(lastSlashIndex + 1)
}

export function getDirectory(path: string | undefined) {
  if (!path) return ""
  const lastSlash = path.lastIndexOf("/")
  if (lastSlash === -1) return "/"
  return path.slice(0, lastSlash) + "/"
}

export function getFileExtension(path: string | undefined) {
  if (!path) return ""
  const lastDotIndex = path.lastIndexOf(".")
  if (lastDotIndex === -1) return path
  return path.slice(lastDotIndex + 1)
}

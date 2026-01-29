import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto"
import { env } from "./env"

const deriveKey = (input: string) => createHash("sha256").update(input).digest()

const resolveVaultKey = () => {
  if (env.VAULT_KEY) {
    const trimmed = env.VAULT_KEY.trim()
    const base64Match = /^[A-Za-z0-9+/=]+$/.test(trimmed)
    if (base64Match) {
      const buf = Buffer.from(trimmed, "base64")
      if (buf.length === 32) return buf
    }
    return deriveKey(trimmed)
  }
  return deriveKey("agent-core-hosted-dev")
}

const KEY = resolveVaultKey()

export function encryptString(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", KEY, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  })
}

export function decryptString(payload: string) {
  const parsed = JSON.parse(payload)
  if (!parsed || parsed.v !== 1) {
    throw new Error("Unsupported vault payload")
  }
  const iv = Buffer.from(parsed.iv, "base64")
  const tag = Buffer.from(parsed.tag, "base64")
  const data = Buffer.from(parsed.data, "base64")
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString("utf8")
}

export function encryptJson(value: unknown) {
  return encryptString(JSON.stringify(value))
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptString(payload)) as T
}

export function safeCompare(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

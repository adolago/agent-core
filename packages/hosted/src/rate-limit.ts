type RateEntry = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateEntry>()

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const entry = { count: 1, resetAt: now + windowMs }
    buckets.set(key, entry)
    return { allowed: true, remaining: limit - 1, resetAt: entry.resetAt }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count += 1
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt }
}

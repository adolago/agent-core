export const domain = (() => {
  const value = process.env.AGENT_CORE_DOMAIN
  if (!value) {
    throw new Error("AGENT_CORE_DOMAIN is required")
  }
  return value
})()

export const zoneID = (() => {
  const value = process.env.AGENT_CORE_ZONE_ID
  if (!value) {
    throw new Error("AGENT_CORE_ZONE_ID is required")
  }
  return value
})()

new cloudflare.RegionalHostname("RegionalHostname", {
  hostname: domain,
  regionKey: "us",
  zoneId: zoneID,
})

export const shortDomain = (() => {
  const value = process.env.AGENT_CORE_SHORT_DOMAIN
  if (!value) {
    throw new Error("AGENT_CORE_SHORT_DOMAIN is required")
  }
  return value
})()

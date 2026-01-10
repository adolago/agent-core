/**
 * Google Antigravity Token Refresh
 *
 * Helper for refreshing OAuth tokens via the Antigravity proxy.
 * Used by the google-antigravity custom loader in provider.ts.
 */

const ANTIGRAVITY_TOKEN_URL = "https://antigravity.opencode.ai/token"

export interface AntigravityTokenResult {
  access: string
  expires: number
}

/**
 * Refresh an Antigravity OAuth token.
 *
 * @param refreshToken - The OAuth refresh token
 * @param projectId - The Google Cloud project ID from antigravity auth
 * @returns New access token and expiry, or null on failure
 */
export async function refreshAntigravityToken(
  refreshToken: string,
  projectId: string,
): Promise<AntigravityTokenResult | null> {
  try {
    const response = await fetch(ANTIGRAVITY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "opencode-antigravity",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        project_id: projectId,
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return {
      access: data.access_token,
      expires: Date.now() + data.expires_in * 1000,
    }
  } catch {
    return null
  }
}

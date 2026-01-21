/**
 * Application-wide constants and configuration
 */
type AppConfig = {
  baseUrl: string
  downloadBaseUrl: string
  github: {
    repoUrl: string
    starsFormatted: {
      compact: string
      full: string
    }
  }
  social: {
    twitter: string
    discord: string
  }
  stats: {
    contributors: string
    commits: string
    monthlyUsers: string
  }
}

export const config: AppConfig = {
  // Base URL
  baseUrl: "/",

  // Downloads
  downloadBaseUrl: "/downloads",

  // GitHub
  github: {
    repoUrl: "",
    starsFormatted: {
      compact: "",
      full: "",
    },
  },

  // Social links
  social: {
    twitter: "",
    discord: "",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "",
    commits: "",
    monthlyUsers: "",
  },
}

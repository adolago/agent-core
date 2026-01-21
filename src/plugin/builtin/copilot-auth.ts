/**
 * GitHub Copilot Authentication Plugin
 *
 * Provides authentication for GitHub Copilot API using:
 * - GitHub OAuth device flow
 * - GitHub token authentication
 *
 * Compatible with the legacy copilot-auth plugin pattern.
 */

import type {
  PluginFactory,
  PluginContext,
  PluginInstance,
  AuthProvider,
} from '../plugin';
import { redactSecrets } from '../../util/shell-escape';

export interface CopilotAuthConfig {
  /** GitHub OAuth client ID */
  clientId?: string;
  /** GitHub token (overrides OAuth) */
  githubToken?: string;
  /** Copilot chat model */
  model?: string;
}

const GITHUB_COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98'; // Public Copilot client ID
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * GitHub Copilot Auth Plugin Factory
 */
export const CopilotAuthPlugin: PluginFactory = async (
  ctx: PluginContext
): Promise<PluginInstance> => {
  const config: CopilotAuthConfig = {
    clientId: ctx.config.get('copilot.clientId') || GITHUB_COPILOT_CLIENT_ID,
    githubToken: ctx.config.get('copilot.githubToken'),
    model: ctx.config.get('copilot.model') || 'gpt-4',
  };

  // Try to get token from environment
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  const authProvider: AuthProvider = {
    provider: 'github-copilot',
    displayName: 'GitHub Copilot',

    async loader(getAuth) {
      const auth = await getAuth();
      if (auth?.accessToken) {
        // Get Copilot token from GitHub token
        const copilotToken = await getCopilotToken(auth.accessToken, ctx.logger);
        if (copilotToken) {
          return { token: copilotToken, githubToken: auth.accessToken };
        }
      }
      if (config.githubToken) {
        const copilotToken = await getCopilotToken(config.githubToken, ctx.logger);
        if (copilotToken) {
          return { token: copilotToken, githubToken: config.githubToken };
        }
      }
      if (envToken) {
        const copilotToken = await getCopilotToken(envToken, ctx.logger);
        if (copilotToken) {
          return { token: copilotToken, githubToken: envToken };
        }
      }
      return {};
    },

    methods: [
      // Device flow OAuth (like VS Code)
      {
        type: 'oauth',
        label: 'Sign in with GitHub',
        async authorize() {
          try {
            // Start device flow
            const deviceResponse = await fetch(GITHUB_DEVICE_CODE_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                client_id: config.clientId,
                scope: 'read:user',
              }),
            });

            if (!deviceResponse.ok) {
              throw new Error('Failed to start device flow');
            }

            const deviceData = await deviceResponse.json();
            const {
              device_code,
              user_code,
              verification_uri,
              expires_in,
              interval,
            } = deviceData;

            return {
              url: verification_uri,
              instructions: `Enter code: ${user_code}`,
              method: 'auto',
              async callback() {
                // Poll for token
                const startTime = Date.now();
                const expiresAt = startTime + expires_in * 1000;
                const pollInterval = (interval || 5) * 1000;

                while (Date.now() < expiresAt) {
                  await sleep(pollInterval);

                  try {
                    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                      },
                      body: JSON.stringify({
                        client_id: config.clientId,
                        device_code,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                      }),
                    });

                    const tokenData = await tokenResponse.json();

                    if (tokenData.access_token) {
                      // Get Copilot token
                      const copilotToken = await getCopilotToken(
                        tokenData.access_token,
                        ctx.logger
                      );

                      if (!copilotToken) {
                        return { type: 'failed' as const };
                      }

                      return {
                        type: 'success' as const,
                        provider: 'github-copilot',
                        access: tokenData.access_token,
                        refresh: tokenData.refresh_token || '',
                        expires: tokenData.expires_in
                          ? Date.now() + tokenData.expires_in * 1000
                          : Date.now() + 8 * 60 * 60 * 1000, // 8 hours default
                      };
                    }

                    if (tokenData.error === 'authorization_pending') {
                      continue;
                    }

                    if (tokenData.error === 'slow_down') {
                      await sleep(5000);
                      continue;
                    }

                    // Other errors mean failure
                    return { type: 'failed' as const };
                  } catch {
                    continue;
                  }
                }

                return { type: 'failed' as const };
              },
            };
          } catch (error) {
            ctx.logger.error('Copilot OAuth failed', {
              error: redactSecrets(error instanceof Error ? error.message : String(error)),
            });
            throw error;
          }
        },
      },

      // Direct token authentication
      {
        type: 'api',
        label: 'GitHub Token',
        prompts: [
          {
            type: 'text',
            key: 'token',
            message: 'Enter your GitHub personal access token',
            placeholder: 'ghp_...',
            validate: (value) => {
              if (!value) return 'Token is required';
              if (!value.startsWith('ghp_') && !value.startsWith('gho_')) {
                return 'Token should start with ghp_ or gho_';
              }
              return undefined;
            },
          },
        ],
        async authorize(inputs) {
          const token = inputs?.token;
          if (!token) {
            return { type: 'failed' };
          }

          // Verify token and get Copilot access
          const copilotToken = await getCopilotToken(token, ctx.logger);
          if (!copilotToken) {
            return { type: 'failed' };
          }

          return {
            type: 'success',
            key: token,
            provider: 'github-copilot',
          };
        },
      },
    ],
  };

  return {
    metadata: {
      name: 'copilot-auth',
      version: '1.0.0',
      description: 'GitHub Copilot authentication provider',
      tags: ['auth', 'github', 'copilot'],
    },

    lifecycle: {
      async init() {
        ctx.logger.info('Copilot auth plugin initialized', {
          hasToken: !!(config.githubToken || envToken),
        });
      },
    },

    auth: [authProvider],

    hooks: {
      'chat.params': async (input, output) => {
        // Set Copilot-specific parameters
        if (input.model.providerId === 'github-copilot') {
          return {
            ...output,
            options: {
              ...output.options,
              model: config.model,
            },
          };
        }
        return output;
      },
    },
  };
};

/**
 * Get Copilot token from GitHub token
 */
async function getCopilotToken(
  githubToken: string,
  logger: { error: (msg: string, data?: Record<string, unknown>) => void }
): Promise<string | null> {
  try {
    // First verify the GitHub token
    const userResponse = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userResponse.ok) {
      logger.error('Failed to verify GitHub token');
      return null;
    }

    // Get Copilot token
    const copilotResponse = await fetch(
      'https://api.github.com/copilot_internal/v2/token',
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/json',
          'Editor-Version': 'vscode/1.85.0',
          'Editor-Plugin-Version': 'copilot-chat/0.12.0',
        },
      }
    );

    if (!copilotResponse.ok) {
      // Try alternative endpoint
      const altResponse = await fetch(
        'https://api.githubcopilot.com/token',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!altResponse.ok) {
        logger.error('Failed to get Copilot token');
        return null;
      }

      const altData = await altResponse.json();
      return altData.token;
    }

    const data = await copilotResponse.json();
    return data.token;
  } catch (error) {
    logger.error('Copilot token request failed', {
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
    });
    return null;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default CopilotAuthPlugin;

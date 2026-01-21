/**
 * Anthropic Authentication Plugin
 *
 * Provides authentication for Anthropic Claude API using:
 * - API key authentication
 * - OAuth authentication (for Anthropic Console)
 *
 * Compatible with the legacy anthropic-auth plugin pattern.
 */

import type {
  PluginFactory,
  PluginContext,
  PluginInstance,
  AuthProvider,
  AuthCredentials,
} from '../plugin';

export interface AnthropicAuthConfig {
  /** Custom API key (overrides env) */
  apiKey?: string;
  /** OAuth client ID for console auth */
  oauthClientId?: string;
  /** OAuth redirect URI */
  oauthRedirectUri?: string;
  /** Default model to use */
  defaultModel?: string;
}

/**
 * Anthropic Auth Plugin Factory
 */
export const AnthropicAuthPlugin: PluginFactory = async (
  ctx: PluginContext
): Promise<PluginInstance> => {
  const config: AnthropicAuthConfig = {
    apiKey: ctx.config.get('anthropic.apiKey'),
    oauthClientId: ctx.config.get('anthropic.oauthClientId'),
    oauthRedirectUri: ctx.config.get('anthropic.oauthRedirectUri') || 'http://localhost:4096/callback',
    defaultModel: ctx.config.get('anthropic.defaultModel') || 'claude-sonnet-4-20250514',
  };

  // Try to get API key from environment
  const envApiKey = process.env.ANTHROPIC_API_KEY;

  const authProvider: AuthProvider = {
    provider: 'anthropic',
    displayName: 'Anthropic Claude',

    async loader(getAuth) {
      const auth = await getAuth();
      if (auth?.apiKey) {
        return { apiKey: auth.apiKey };
      }
      if (config.apiKey) {
        return { apiKey: config.apiKey };
      }
      if (envApiKey) {
        return { apiKey: envApiKey };
      }
      return {};
    },

    methods: [
      // API Key authentication
      {
        type: 'api',
        label: 'API Key',
        prompts: [
          {
            type: 'text',
            key: 'apiKey',
            message: 'Enter your Anthropic API key',
            placeholder: 'sk-ant-...',
            validate: (value) => {
              if (!value) return 'API key is required';
              if (!value.startsWith('sk-ant-')) {
                return 'API key should start with sk-ant-';
              }
              return undefined;
            },
          },
        ],
        async authorize(inputs) {
          const apiKey = inputs?.apiKey;
          if (!apiKey) {
            return { type: 'failed' };
          }

          // Validate the API key by making a test request
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: config.defaultModel,
                max_tokens: 1,
                messages: [{ role: 'user', content: 'Hi' }],
              }),
            });

            // A 400 error for max_tokens=1 is expected, but 401 means invalid key
            if (response.status === 401) {
              return { type: 'failed' };
            }

            return {
              type: 'success',
              key: apiKey,
              provider: 'anthropic',
            };
          } catch (error) {
            ctx.logger.error('Failed to validate Anthropic API key', {
              error: error instanceof Error ? error.message : String(error),
            });
            return { type: 'failed' };
          }
        },
      },

      // OAuth authentication (for Anthropic Console)
      ...(config.oauthClientId
        ? [
            {
              type: 'oauth' as const,
              label: 'Sign in with Anthropic',
              prompts: [
                {
                  type: 'select' as const,
                  key: 'workspace',
                  message: 'Select workspace',
                  options: [
                    { label: 'Personal', value: 'personal' },
                    { label: 'Organization', value: 'org' },
                  ],
                },
              ],
              async authorize(inputs?: Record<string, string>) {
                const workspace = inputs?.workspace || 'personal';
                const state = generateState();

                const authUrl = new URL('https://console.anthropic.com/oauth/authorize');
                authUrl.searchParams.set('client_id', config.oauthClientId!);
                authUrl.searchParams.set('redirect_uri', config.oauthRedirectUri!);
                authUrl.searchParams.set('response_type', 'code');
                authUrl.searchParams.set('scope', 'api');
                authUrl.searchParams.set('state', state);
                if (workspace === 'org') {
                  authUrl.searchParams.set('prompt', 'select_account');
                }

                return {
                  url: authUrl.toString(),
                  instructions: 'Complete authentication in your browser',
                  method: 'code' as const,
                  async callback(code: string) {
                    try {
                      // Exchange code for tokens
                      const tokenResponse = await fetch(
                        'https://console.anthropic.com/oauth/token',
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                          },
                          body: new URLSearchParams({
                            grant_type: 'authorization_code',
                            client_id: config.oauthClientId!,
                            redirect_uri: config.oauthRedirectUri!,
                            code,
                          }),
                        }
                      );

                      if (!tokenResponse.ok) {
                        return { type: 'failed' as const };
                      }

                      const tokens = await tokenResponse.json();

                      return {
                        type: 'success' as const,
                        provider: 'anthropic',
                        access: tokens.access_token,
                        refresh: tokens.refresh_token,
                        expires: Date.now() + tokens.expires_in * 1000,
                      };
                    } catch (error) {
                      ctx.logger.error('OAuth token exchange failed', {
                        error: error instanceof Error ? error.message : String(error),
                      });
                      return { type: 'failed' as const };
                    }
                  },
                };
              },
            },
          ]
        : []),
    ],
  };

  return {
    metadata: {
      name: 'anthropic-auth',
      version: '1.0.0',
      description: 'Anthropic Claude authentication provider',
      tags: ['auth', 'anthropic', 'claude'],
    },

    lifecycle: {
      async init() {
        ctx.logger.info('Anthropic auth plugin initialized', {
          hasApiKey: !!(config.apiKey || envApiKey),
          hasOAuth: !!config.oauthClientId,
        });
      },
    },

    auth: [authProvider],

    hooks: {
      'chat.params': async (input, output) => {
        // Set Anthropic-specific parameters
        if (input.model.providerId === 'anthropic') {
          return {
            ...output,
            options: {
              ...output.options,
              'anthropic-version': '2023-06-01',
            },
          };
        }
        return output;
      },
    },
  };
};

/**
 * Generate a random state for OAuth
 */
function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default AnthropicAuthPlugin;

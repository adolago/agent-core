/**
 * Inworld Authentication Plugin
 *
 * Provides authentication for Inworld AI STT (Speech-to-Text) service.
 * Used for dictation in the TUI and audio transcription in messaging.
 *
 * Credentials are stored as:
 * - API key: Base64 runtime API key
 * - Endpoint: Runtime graph endpoint (e.g., https://api.inworld.ai/.../graph:start)
 */

import type {
  PluginFactory,
  PluginContext,
  PluginInstance,
  AuthProvider,
} from '../plugin';

export interface InworldAuthConfig {
  apiKey?: string;
  endpoint?: string;
}

/**
 * Inworld Auth Plugin Factory
 */
export const InworldAuthPlugin: PluginFactory = async (
  ctx: PluginContext
): Promise<PluginInstance> => {
  const config: InworldAuthConfig = {
    apiKey: ctx.config.get('inworld.apiKey'),
    endpoint: ctx.config.get('inworld.endpoint'),
  };

  const envApiKey = process.env.INWORLD_API_KEY ?? process.env.OPENCODE_INWORLD_API_KEY;
  const envEndpoint = process.env.INWORLD_STT_ENDPOINT ?? process.env.OPENCODE_INWORLD_STT_ENDPOINT;

  const authProvider: AuthProvider = {
    provider: 'inworld',
    displayName: 'Inworld AI',

    async loader(getAuth) {
      const auth = await getAuth();
      if (auth?.apiKey && auth?.endpoint) {
        return { apiKey: auth.apiKey, endpoint: auth.endpoint };
      }
      if (config.apiKey && config.endpoint) {
        return { apiKey: config.apiKey, endpoint: config.endpoint };
      }
      if (envApiKey && envEndpoint) {
        return { apiKey: envApiKey, endpoint: envEndpoint };
      }
      return {};
    },

    methods: [
      {
        type: 'api',
        label: 'API Key + Endpoint',
        prompts: [
          {
            type: 'text',
            key: 'endpoint',
            message: 'Enter your Inworld runtime graph endpoint',
            placeholder: 'https://api.inworld.ai/cloud/workspaces/.../graphs/.../v1/graph:start',
            validate: (value) => {
              if (!value) return 'Endpoint is required';
              if (!value.includes('inworld.ai') && !value.includes('graph:start')) {
                return 'Endpoint should be an Inworld runtime graph URL';
              }
              return undefined;
            },
          },
          {
            type: 'text',
            key: 'apiKey',
            message: 'Enter your Inworld base64 runtime API key',
            placeholder: 'Base64 encoded API key',
            validate: (value) => {
              if (!value) return 'API key is required';
              try {
                atob(value);
              } catch {
                return 'API key should be base64 encoded';
              }
              return undefined;
            },
          },
        ],
        async authorize(inputs) {
          const apiKey = inputs?.apiKey;
          const endpoint = inputs?.endpoint;

          if (!apiKey || !endpoint) {
            return { type: 'failed' };
          }

          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${apiKey}`,
              },
              body: JSON.stringify({
                input: {
                  audio: {
                    data: '',
                    sampleRate: 16000,
                    mimeType: 'audio/wav',
                  },
                },
              }),
            });

            if (response.status === 401 || response.status === 403) {
              return { type: 'failed' };
            }

            return {
              type: 'success',
              key: JSON.stringify({ apiKey, endpoint }),
              provider: 'inworld',
            };
          } catch (error) {
            ctx.logger.error('Failed to validate Inworld credentials', {
              error: error instanceof Error ? error.message : String(error),
            });
            return { type: 'failed' };
          }
        },
      },
    ],
  };

  return {
    metadata: {
      name: 'inworld-auth',
      version: '1.0.0',
      description: 'Inworld AI STT authentication provider',
      tags: ['auth', 'inworld', 'stt', 'dictation'],
    },

    lifecycle: {
      async init() {
        ctx.logger.info('Inworld auth plugin initialized', {
          hasApiKey: !!(config.apiKey || envApiKey),
          hasEndpoint: !!(config.endpoint || envEndpoint),
        });
      },
    },

    auth: [authProvider],
  };
};

export default InworldAuthPlugin;

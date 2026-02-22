import type { Env } from '../env.js';

/**
 * AI provider adapter — pluggable LLM client.
 * Supports OpenAI-compatible APIs.
 */
export interface AiProvider {
  generateCompletion(params: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;
}

/**
 * Create an AI provider from config
 */
export function createAiProvider(config: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}): AiProvider {
  return new OpenAICompatibleProvider(config.apiBaseUrl, config.apiKey, config.model);
}

/**
 * Get AI provider for a workspace.
 * - FREE plan: must use BYO key (decrypted from workspace config)
 * - Paid plans: use default provider or BYO key if configured
 */
export async function getAiProviderForWorkspace(
  env: Env,
  workspaceAiConfig: string | null,
  plan: string,
  decryptFn: (encrypted: string, key: string) => Promise<string>,
): Promise<AiProvider | null> {
  // Try workspace BYO config first
  if (workspaceAiConfig) {
    try {
      const decrypted = await decryptFn(workspaceAiConfig, env.ENCRYPTION_KEY);
      const config = JSON.parse(decrypted);
      return createAiProvider({
        apiBaseUrl: config.apiBaseUrl || 'https://api.openai.com/v1',
        apiKey: config.apiKey,
        model: config.model || 'gpt-4o-mini',
      });
    } catch {
      // Invalid config — fall through to default
    }
  }

  // FREE plan requires BYO key
  if (plan === 'FREE') {
    return null;
  }

  // Paid plans: use default provider
  if (env.DEFAULT_AI_API_KEY) {
    return createAiProvider({
      apiBaseUrl: env.DEFAULT_AI_API_BASE || 'https://api.openai.com/v1',
      apiKey: env.DEFAULT_AI_API_KEY,
      model: env.DEFAULT_AI_MODEL || 'gpt-4o-mini',
    });
  }

  return null;
}

class OpenAICompatibleProvider implements AiProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  async generateCompletion(params: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI provider error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content ?? '';
  }
}

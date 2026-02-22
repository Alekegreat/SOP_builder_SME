/**
 * Queue consumer's local AI provider.
 * Same interface as worker's ai-provider but standalone.
 */

export interface AiProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface AiProvider {
  chat(messages: { role: string; content: string }[]): Promise<string>;
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  return new OpenAICompatibleProvider(config);
}

class OpenAICompatibleProvider implements AiProvider {
  constructor(private config: AiProviderConfig) {}

  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`AI API error ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as {
      choices: { message: { content: string } }[];
    };

    return data.choices[0]?.message?.content ?? '';
  }
}

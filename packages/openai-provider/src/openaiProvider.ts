import {
  ModelRequest,
  ModelResponse,
  ProviderError,
} from '../../core/src/modelProvider.js';
import {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
} from '../../core/src/types.js';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export interface OpenAIProviderOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export class OpenAIProviderAdapter implements ProviderAdapter {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAIProviderOptions) {
    this.endpoint = options.endpoint ?? 'https://api.openai.com/v1/chat/completions';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  static fromEnv(
    environment: NodeJS.ProcessEnv = process.env,
    fetchImpl?: typeof fetch,
  ): OpenAIProviderAdapter {
    const apiKey = environment.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError('OPENAI_API_KEY is required for the OpenAI provider');
    }

    return new OpenAIProviderAdapter({
      apiKey,
      endpoint: environment.OPENAI_API_URL,
      fetchImpl,
    });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const prompt = this.readPrompt(request);
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model.id,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      signal: request.signal,
    });
    const payload = await this.readResponse(response);
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new ProviderError('OpenAI response did not contain message content');
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch (error) {
      throw new ProviderError('OpenAI response was not valid JSON', { cause: error });
    }

    return {
      content: parsedContent,
      contentType: 'application/json',
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
    };
  }

  private readPrompt(request: ModelRequest): string {
    const prompt = request.input.prompt;
    if (typeof prompt === 'string') {
      return prompt;
    }

    return JSON.stringify(request.input);
  }

  private async readResponse(response: Response): Promise<ChatCompletionResponse> {
    const payload = await response.json() as ChatCompletionResponse;
    if (!response.ok) {
      throw new ProviderError(payload.error?.message ?? `OpenAI request failed with status ${response.status}`);
    }

    return payload;
  }
}
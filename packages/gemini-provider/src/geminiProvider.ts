import { ModelRequest, ProviderError } from '../../core/src/modelProvider.js';
import {
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
} from '../../core/src/types.js';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

export interface GeminiProviderOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export class GeminiProviderAdapter implements ProviderAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  static fromEnv(
    environment: NodeJS.ProcessEnv = process.env,
    fetchImpl?: typeof fetch,
  ): GeminiProviderAdapter {
    const apiKey = environment.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProviderError('GEMINI_API_KEY is required for the Gemini provider');
    }

    return new GeminiProviderAdapter({
      apiKey,
      endpoint: environment.GEMINI_API_URL,
      fetchImpl,
    });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const endpoint = this.options.endpoint
      ?? `https://generativelanguage.googleapis.com/v1beta/models/${request.model.id}:generateContent`;
    const response = await this.fetchImpl(`${endpoint}?key=${encodeURIComponent(this.options.apiKey)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: this.readPrompt(request) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: request.signal,
    });
    const payload = await this.readResponse(response);
    const content = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!content) {
      throw new ProviderError('Gemini response did not contain message content');
    }

    try {
      return {
        content: JSON.parse(content),
        contentType: 'application/json',
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
      };
    } catch (error) {
      throw new ProviderError('Gemini response was not valid JSON', { cause: error });
    }
  }

  private readPrompt(request: ModelRequest): string {
    const prompt = request.input.prompt;
    return typeof prompt === 'string' ? prompt : JSON.stringify(request.input);
  }

  private async readResponse(response: Response): Promise<GeminiResponse> {
    const payload = await response.json() as GeminiResponse;
    if (!response.ok) {
      throw new ProviderError(payload.error?.message ?? `Gemini request failed with status ${response.status}`);
    }

    return payload;
  }
}
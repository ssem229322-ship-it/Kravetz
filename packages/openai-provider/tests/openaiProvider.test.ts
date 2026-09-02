import { describe, expect, it } from '@jest/globals';
import { Model, ModelVersion } from '../../core/src/types.js';
import { OpenAIProviderAdapter } from '../src/openaiProvider.js';

const model: Model = { id: 'test-model' };
const modelVersion: ModelVersion = {
  id: 'test-model-v1',
  modelId: model.id,
  version: '1',
  providerId: 'openai',
};

describe('OpenAIProviderAdapter', () => {
  it('transforms a provider response into the agnostic ModelResponse', async () => {
    let request: RequestInit | undefined;
    const adapter = new OpenAIProviderAdapter({
      apiKey: 'unit-test-key',
      endpoint: 'https://provider.test/completions',
      fetchImpl: async (_input, init) => {
        request = init;
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"answer":"ok"}' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }), { status: 200 });
      },
    });

    const response = await adapter.generate({
      input: { prompt: 'Return JSON.' },
      model,
      modelVersion,
    });

    expect(response).toEqual({
      content: { answer: 'ok' },
      contentType: 'application/json',
      inputTokens: 3,
      outputTokens: 2,
    });
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({
      authorization: 'Bearer unit-test-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Return JSON.' }],
      response_format: { type: 'json_object' },
    });
  });

  it('rejects provider errors without leaking response implementation details', async () => {
    const adapter = new OpenAIProviderAdapter({
      apiKey: 'unit-test-key',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }),
    });

    await expect(adapter.generate({ input: {}, model, modelVersion })).rejects.toThrow('rate limited');
  });

  it('rejects missing configuration without making a request', () => {
    expect(() => OpenAIProviderAdapter.fromEnv({})).toThrow('OPENAI_API_KEY');
  });

  it('uses deterministic local response parsing', async () => {
    const adapter = new OpenAIProviderAdapter({
      apiKey: 'unit-test-key',
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: '{"answer":"same"}' } }],
      }), { status: 200 }),
    });
    const input = { input: {}, model, modelVersion };

    await expect(adapter.generate(input)).resolves.toEqual(await adapter.generate(input));
  });
});
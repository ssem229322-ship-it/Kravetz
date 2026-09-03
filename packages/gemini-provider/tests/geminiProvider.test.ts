import { describe, expect, it } from '@jest/globals';
import { Model, ModelVersion, ProviderAdapter } from '../../core/src/types.js';
import { GeminiProviderAdapter } from '../src/geminiProvider.js';

const model: Model = { id: 'gemini-2.5-flash' };
const modelVersion: ModelVersion = {
  id: 'gemini-model-v1',
  modelId: model.id,
  version: '1',
  providerId: 'gemini',
};

describe('GeminiProviderAdapter', () => {
  it('implements ProviderAdapter and transforms Gemini JSON responses', async () => {
    let requestUrl = '';
    let request: RequestInit | undefined;
    const adapter: ProviderAdapter = new GeminiProviderAdapter({
      apiKey: 'unit-test-key',
      endpoint: 'https://provider.test/v1/models/test:generateContent',
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        request = init;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3 },
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
      inputTokens: 4,
      outputTokens: 3,
    });
    expect(requestUrl).toBe('https://provider.test/v1/models/test:generateContent?key=unit-test-key');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(request?.body))).toEqual({
      contents: [{ parts: [{ text: 'Return JSON.' }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
  });

  it('maps API errors to ProviderError', async () => {
    const adapter = new GeminiProviderAdapter({
      apiKey: 'unit-test-key',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'invalid request' } }), { status: 400 }),
    });

    await expect(adapter.generate({ input: {}, model, modelVersion })).rejects.toThrow('invalid request');
  });

  it('rejects missing API key configuration without a request', () => {
    expect(() => GeminiProviderAdapter.fromEnv({})).toThrow('GEMINI_API_KEY');
  });

  it('uses the configured model in the official endpoint shape', async () => {
    let requestUrl = '';
    const adapter = new GeminiProviderAdapter({
      apiKey: 'unit-test-key',
      fetchImpl: async (input) => {
        requestUrl = String(input);
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 });
      },
    });

    await adapter.generate({ input: { prompt: 'Return JSON.' }, model, modelVersion });

    expect(requestUrl).toContain('/models/gemini-2.5-flash:generateContent?key=');
  });
});
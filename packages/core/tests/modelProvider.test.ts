import { describe, expect, it } from '@jest/globals';
import {
  AgentExecution,
  AgentVersion,
  Model,
  ModelVersion,
  Provider,
  ProviderAdapter,
} from '../src/types.js';
import {
  ModelAgentRuntime,
  ProviderError,
  ProviderModelClient,
} from '../src/modelProvider.js';

function execution(): AgentExecution {
  return {
    id: 'execution-1',
    runId: 'run-1',
    stepId: 'step-1',
    status: 'running',
    input: { message: 'hello' },
    outputArtifactIds: [],
  };
}

function setup(provider: Provider, content: string) {
  const model: Model = { id: 'model-1' };
  const modelVersion: ModelVersion = {
    id: `${provider.id}-model-1`,
    modelId: model.id,
    version: '1',
    providerId: provider.id,
  };
  const agentVersion: AgentVersion = {
    id: `${provider.id}-agent-1`,
    modelVersionId: modelVersion.id,
    configuration: Object.freeze({ temperature: 0 }),
  };
  const adapter: ProviderAdapter = {
    provider,
    async generate() {
      return { content, contentType: 'text/plain' };
    },
  };

  return {
    agentVersion,
    model,
    modelVersion,
    client: new ProviderModelClient(model, modelVersion, adapter),
  };
}

describe('Model provider abstractions', () => {
  it('interchanges Provider A and Provider B without changing the runtime', async () => {
    const providerA = setup({ id: 'provider-a' }, 'from-a');
    const providerB = setup({ id: 'provider-b' }, 'from-b');
    const runtime = new ModelAgentRuntime({
      agentVersions: {
        [providerA.agentVersion.id]: providerA.agentVersion,
        [providerB.agentVersion.id]: providerB.agentVersion,
      },
      models: { [providerA.model.id]: providerA.model },
      modelVersions: {
        [providerA.modelVersion.id]: providerA.modelVersion,
        [providerB.modelVersion.id]: providerB.modelVersion,
      },
      modelClients: {
        [providerA.modelVersion.id]: providerA.client,
        [providerB.modelVersion.id]: providerB.client,
      },
    });

    const resultA = await runtime.execute({
      execution: execution(),
      step: { id: 'step-a', agentVersionId: providerA.agentVersion.id, inputMapping: {} },
    });
    const resultB = await runtime.execute({
      execution: execution(),
      step: { id: 'step-b', agentVersionId: providerB.agentVersion.id, inputMapping: {} },
    });

    expect(resultA.artifacts[0].content).toBe('from-a');
    expect(resultB.artifacts[0].content).toBe('from-b');
    expect(resultA.execution.provider).toBe('provider-a');
    expect(resultB.execution.provider).toBe('provider-b');
  });

  it('classifies provider failures without a concrete provider SDK', async () => {
    const error = new ProviderError('provider unavailable');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ProviderError');
    expect(error.kind).toBe('provider');
  });
});
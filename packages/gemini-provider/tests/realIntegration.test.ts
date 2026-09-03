import { describe, expect, it } from '@jest/globals';
import { ModelAgentRuntime, ProviderModelClient } from '../../core/src/modelProvider.js';
import { createInMemoryPersistence } from '../../core/src/inMemoryPersistence.js';
import { Orchestrator } from '../../core/src/orchestrator.js';
import { AgentVersion, Model, ModelVersion } from '../../core/src/types.js';
import { DeterministicEvaluator } from '../../core/src/validation.js';
import { GeminiProviderAdapter } from '../src/geminiProvider.js';

const runRealIntegration = process.env.GEMINI_API_KEY ? it : it.skip;

describe('Gemini real integration', () => {
  runRealIntegration('executes a Task through Gemini and evaluates its Artifact (requires GEMINI_API_KEY)', async () => {
    const model: Model = { id: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' };
    const modelVersion: ModelVersion = {
      id: 'gemini-real-model-v1',
      modelId: model.id,
      version: '1',
      providerId: 'gemini',
    };
    const agentVersion: AgentVersion = {
      id: 'gemini-agent-v1',
      modelVersionId: modelVersion.id,
      configuration: Object.freeze({}),
    };
    const runtime = new ModelAgentRuntime({
      agentVersions: { [agentVersion.id]: agentVersion },
      models: { [model.id]: model },
      modelVersions: { [modelVersion.id]: modelVersion },
      modelClients: {
        [modelVersion.id]: new ProviderModelClient(
          model,
          modelVersion,
          GeminiProviderAdapter.fromEnv(),
        ),
      },
    });
    const result = await new Orchestrator({
      persistence: createInMemoryPersistence(),
      runtime,
      generateId: () => 'gemini-real-id',
      now: () => '2026-09-02T00:00:00.000Z',
    }).execute({
      id: 'gemini-real-task',
      input: { prompt: 'Return exactly a JSON object with string fields "answer" and "reason".' },
      workflowDefinition: {
        steps: [{ id: 'step-1', agentVersionId: agentVersion.id, inputMapping: {} }],
        onStepError: 'abort',
        finalStepId: 'step-1',
      },
      status: 'pending',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    });
    const execution = result.executions[0];
    const artifact = result.artifacts[0];

    expect(execution.status).toBe('completed');
    expect(execution.model).toBe(model.id);
    expect(execution.provider).toBe('gemini');
    expect(artifact.id).toBe(result.run.finalArtifactId);
    expect(artifact.runId).toBe(result.run.id);
    expect(artifact.executionId).toBe(execution.id);
    expect(new DeterministicEvaluator().evaluate(artifact, {
      id: 'gemini-json-policy',
      requiredContentType: 'application/json',
      requiredFields: ['answer', 'reason'],
    }).passed).toBe(true);
  });
});
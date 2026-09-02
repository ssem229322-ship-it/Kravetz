import { describe, expect, it } from '@jest/globals';
import { ModelAgentRuntime, ProviderModelClient } from '../../core/src/modelProvider.js';
import { createInMemoryPersistence } from '../../core/src/inMemoryPersistence.js';
import { Orchestrator } from '../../core/src/orchestrator.js';
import { AgentVersion, Model, ModelVersion } from '../../core/src/types.js';
import { DeterministicEvaluator } from '../../core/src/validation.js';
import { OpenAIProviderAdapter } from '../src/openaiProvider.js';

const runRealIntegration = process.env.OPENAI_API_KEY ? it : it.skip;

describe('OpenAI real integration', () => {
  runRealIntegration('executes a Task through the real LLM and evaluates its Artifact (requires OPENAI_API_KEY)', async () => {
    const model: Model = { id: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' };
    const modelVersion: ModelVersion = {
      id: 'openai-real-model-v1',
      modelId: model.id,
      version: '1',
      providerId: 'openai',
    };
    const agentVersion: AgentVersion = {
      id: 'real-agent-v1',
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
          OpenAIProviderAdapter.fromEnv(),
        ),
      },
    });
    const result = await new Orchestrator({
      persistence: createInMemoryPersistence(),
      runtime,
      generateId: () => 'real-integration-id',
      now: () => '2026-09-02T00:00:00.000Z',
    }).execute({
      id: 'real-llm-task',
      input: {
        prompt: 'Return exactly a JSON object with string fields "answer" and "reason".',
      },
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
    expect(execution.provider).toBe('openai');
    expect(artifact.id).toBe(result.run.finalArtifactId);
    expect(artifact.runId).toBe(result.run.id);
    expect(artifact.executionId).toBe(execution.id);

    const evaluation = new DeterministicEvaluator().evaluate(artifact, {
      id: 'real-json-policy',
      requiredContentType: 'application/json',
      requiredFields: ['answer', 'reason'],
    });
    expect(evaluation.passed).toBe(true);
  });
});
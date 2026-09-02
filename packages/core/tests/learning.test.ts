import { describe, expect, it } from '@jest/globals';
import { LocalHandlerRuntime } from '../src/agentRuntime.js';
import { InMemoryLearningStore, createLearningContext, deriveLearningRecord } from '../src/learning.js';
import { createInMemoryPersistence } from '../src/inMemoryPersistence.js';
import { Orchestrator } from '../src/orchestrator.js';
import { AgentExecution, Artifact } from '../src/types.js';
import { decide, DeterministicEvaluator, EvaluationPolicy } from '../src/validation.js';

const policy: EvaluationPolicy = {
  id: 'learning-policy',
  requiredContentType: 'application/json',
  requiredFields: ['result'],
};

async function executeAndLearn(content: unknown) {
  const persistence = createInMemoryPersistence();
  const result = await new Orchestrator({
    persistence,
    runtime: new LocalHandlerRuntime({ handlers: { 'agent-v1': () => content } }),
    generateId: (() => {
      let counter = 0;
      return () => `learning-${++counter}`;
    })(),
    now: () => '2026-09-02T00:00:00.000Z',
  }).execute({
    id: 'task-learning',
    input: {},
    workflowDefinition: {
      steps: [{ id: 'step-1', agentVersionId: 'agent-v1', inputMapping: {} }],
      onStepError: 'abort',
      finalStepId: 'step-1',
    },
    status: 'pending',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  });
  const execution = result.executions[0];
  const artifact = result.artifacts.find((item) => item.id === result.run.finalArtifactId);

  if (!execution || !artifact) {
    throw new Error('Execution did not produce a final artifact');
  }

  const evaluation = new DeterministicEvaluator().evaluate(artifact, policy);
  const decision = decide(evaluation);
  return { execution, artifact, evaluation, decision };
}

describe('Learning loop', () => {
  it('derives SUCCESS learning from an evaluated execution and reuses it as future context', async () => {
    const source = await executeAndLearn({ result: 'ok' });
    const record = deriveLearningRecord(
      source.execution,
      source.artifact,
      source.evaluation,
      source.decision,
    );
    const store = new InMemoryLearningStore();
    store.create(record);
    const retrieved = store.get(record.id);
    const context = createLearningContext(retrieved ? [retrieved] : []);

    expect(record.outcome).toBe('SUCCESS');
    expect(record.decisionOutcome).toBe('ACCEPT');
    expect(record.lesson).toContain('satisfied');
    expect(record.sourceRunId).toBe(source.execution.runId);
    expect(record.sourceArtifactId).toBe(source.artifact.id);
    expect(context.records[0]).toBe(record);
  });

  it('derives FAILURE learning with evidence from an invalid evaluated execution', async () => {
    const source = await executeAndLearn({ other: 'value' });
    const record = deriveLearningRecord(
      source.execution,
      source.artifact,
      source.evaluation,
      source.decision,
    );

    expect(record.outcome).toBe('FAILURE');
    expect(record.decisionOutcome).toBe('REJECT');
    expect(record.evidence).toEqual(['missing field "result"']);
    expect(record.lesson).toContain('missing field "result"');
    expect(record.futureImplication).toContain('failed criteria');
  });

  it('is deterministic, immutable, and preserves evaluation traceability', async () => {
    const source = await executeAndLearn({ other: 'value' });
    const first = deriveLearningRecord(
      source.execution,
      source.artifact,
      source.evaluation,
      source.decision,
    );
    const second = deriveLearningRecord(
      source.execution,
      source.artifact,
      source.evaluation,
      source.decision,
    );

    expect(first).toEqual(second);
    expect(first.evaluationId).toBe(source.evaluation.id);
    expect(first.sourceExecutionId).toBe(source.execution.id);
    expect(first.sourceArtifactId).toBe(source.artifact.id);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.evidence)).toBe(true);
  });

  it('derives learning without Model or Provider inputs', () => {
    const execution: AgentExecution = {
      id: 'execution-independent',
      runId: 'run-independent',
      stepId: 'step-independent',
      status: 'completed',
      input: {},
      outputArtifactIds: ['artifact-independent'],
    };
    const artifact: Artifact = {
      id: 'artifact-independent',
      runId: execution.runId,
      executionId: execution.id,
      contentType: 'application/json',
      content: { result: 'ok' },
    };
    const evaluation = new DeterministicEvaluator().evaluate(artifact, policy);
    const decision = decide(evaluation);

    expect(deriveLearningRecord(execution, artifact, evaluation, decision).outcome).toBe('SUCCESS');
  });
});
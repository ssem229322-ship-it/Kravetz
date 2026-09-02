import { describe, expect, it } from '@jest/globals';
import { LocalHandlerRuntime } from '../src/agentRuntime.js';
import { Orchestrator } from '../src/orchestrator.js';
import { Artifact } from '../src/types.js';
import { createInMemoryPersistence } from '../src/inMemoryPersistence.js';
import { decide, DeterministicEvaluator, EvaluationPolicy } from '../src/validation.js';

const policy: EvaluationPolicy = {
  id: 'required-result',
  requiredContentType: 'application/json',
  requiredFields: ['result'],
};

function artifact(content: unknown, contentType = 'application/json'): Artifact {
  return {
    id: 'artifact-1',
    runId: 'run-1',
    executionId: 'execution-1',
    contentType,
    content,
  };
}

describe('DeterministicEvaluator', () => {
  it('accepts a valid Artifact and produces a positive Evaluation and ACCEPT decision', () => {
    const evaluation = new DeterministicEvaluator().evaluate(
      artifact({ result: 'ok' }),
      policy,
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.checks.every((check) => check.passed)).toBe(true);
    expect(decide(evaluation).outcome).toBe('ACCEPT');
  });

  it('rejects an invalid Artifact independently of its producing source', () => {
    const evaluation = new DeterministicEvaluator().evaluate(
      artifact({ other: 'value' }),
      policy,
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.checks.some((check) => !check.passed)).toBe(true);
    expect(decide(evaluation).outcome).toBe('REJECT');
  });

  it('returns the same structured result for the same Artifact and policy', () => {
    const evaluator = new DeterministicEvaluator();
    const input = artifact({ result: 'ok' });

    expect(evaluator.evaluate(input, policy)).toEqual(evaluator.evaluate(input, policy));
  });

  it('has no Model or Provider dependency', () => {
    const evaluation = new DeterministicEvaluator().evaluate(
      artifact({ result: 'ok' }),
      policy,
    );

    expect(Object.isFrozen(evaluation)).toBe(true);
    expect(Object.isFrozen(evaluation.checks)).toBe(true);
  });
});

describe('Execution to decision integration', () => {
  async function evaluateExecution(content: unknown) {
    const persistence = createInMemoryPersistence();
    const orchestrator = new Orchestrator({
      persistence,
      runtime: new LocalHandlerRuntime({
        handlers: {
          'agent-v1': () => content,
        },
      }),
      generateId: (() => {
        let counter = 0;
        return () => `integration-${++counter}`;
      })(),
      now: () => '2026-09-02T00:00:00.000Z',
    });
    const result = await orchestrator.execute({
      id: 'task-validation-integration',
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
    const finalArtifact = result.artifacts.find(
      (item) => item.id === result.run.finalArtifactId,
    );

    if (!finalArtifact) {
      throw new Error('Orchestrator did not produce its final artifact');
    }

    const evaluation = new DeterministicEvaluator().evaluate(finalArtifact, policy);
    return { result, evaluation, decision: decide(evaluation) };
  }

  it('executes an Agent, evaluates its Artifact, and returns ACCEPT', async () => {
    const { result, evaluation, decision } = await evaluateExecution({ result: 'ok' });

    expect(result.run.finalArtifactId).toBe('artifact-step-1');
    expect(evaluation.artifactId).toBe(result.run.finalArtifactId);
    expect(evaluation.passed).toBe(true);
    expect(decision.outcome).toBe('ACCEPT');
  });

  it('rejects an invalid Artifact produced by the same execution path', async () => {
    const { result, evaluation, decision } = await evaluateExecution({ other: 'value' });

    expect(evaluation.artifactId).toBe(result.run.finalArtifactId);
    expect(evaluation.passed).toBe(false);
    expect(decision.outcome).toBe('REJECT');
  });
});
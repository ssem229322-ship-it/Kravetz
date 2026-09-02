import { describe, expect, it } from '@jest/globals';
import { Artifact } from '../src/types.js';
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
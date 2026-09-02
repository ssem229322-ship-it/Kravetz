import { describe, expect, it } from '@jest/globals';
import { LocalHandlerRuntime } from '../src/agentRuntime.js';
import { createInMemoryPersistence } from '../src/inMemoryPersistence.js';
import { Orchestrator } from '../src/orchestrator.js';
import { Artifact } from '../src/types.js';
import { decide, DeterministicEvaluator, EvaluationPolicy } from '../src/validation.js';
import { Review, StructuralReviewer } from '../src/review.js';

const policy: EvaluationPolicy = {
  id: 'review-policy',
  requiredContentType: 'application/json',
  requiredFields: ['result'],
};

const reviewer = new StructuralReviewer({
  reviewerId: 'structural-reviewer',
  reviewerVersion: 'v1',
  createdAt: '2026-09-02T00:00:00.000Z',
});

function evaluate(artifact: Artifact) {
  return new DeterministicEvaluator().evaluate(artifact, policy);
}

function validArtifact(): Artifact {
  return {
    id: 'artifact-1',
    runId: 'run-1',
    executionId: 'execution-1',
    contentType: 'application/json',
    content: { result: 'ok' },
  };
}

describe('StructuralReviewer', () => {
  it('passes a coherent artifact and evaluation with traceable reviewer identity', () => {
    const artifact = validArtifact();
    const evaluation = evaluate(artifact);
    const review = reviewer.review(artifact, evaluation);

    expect(evaluation.passed).toBe(true);
    expect(review.outcome).toBe('PASS');
    expect(review.artifactId).toBe(artifact.id);
    expect(review.evaluationId).toBe(evaluation.id);
    expect(review.reviewerId).toBe('structural-reviewer');
    expect(review.reviewerVersion).toBe('v1');
    expect(review.evidence).toHaveLength(3);
  });

  it('detects an artifact/evaluation inconsistency that the evaluator does not check', () => {
    const artifact = validArtifact();
    const evaluation = evaluate(artifact);
    const inconsistentEvaluation = { ...evaluation, artifactId: 'other-artifact' };
    const review = reviewer.review(artifact, inconsistentEvaluation);

    expect(evaluation.passed).toBe(true);
    expect(review.outcome).toBe('FAIL');
    expect(review.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'evaluationArtifactRelationship',
        passed: false,
      }),
    ]));
  });

  it('produces independent deterministic evidence without delegating to Evaluator', () => {
    const artifact = validArtifact();
    const evaluation = evaluate(artifact);
    const first = reviewer.review(artifact, evaluation);
    const second = reviewer.review(artifact, evaluation);

    expect(first).toEqual(second);
    expect(first.evidence.map((check) => check.name)).toEqual([
      'artifactIdentity',
      'artifactProvenance',
      'evaluationArtifactRelationship',
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.evidence)).toBe(true);
  });

  it('does not modify reviewed inputs and leaves disagreement unresolved', () => {
    const artifact = validArtifact();
    const evaluation = evaluate(artifact);
    const decision = decide(evaluation);
    const artifactBefore = structuredClone(artifact);
    const evaluationBefore = structuredClone(evaluation);
    const decisionBefore = structuredClone(decision);
    const review = reviewer.review(
      { ...artifact, executionId: '' },
      evaluation,
    );

    expect(review.outcome).toBe('FAIL');
    expect(artifact).toEqual(artifactBefore);
    expect(evaluation).toEqual(evaluationBefore);
    expect(decision).toEqual(decisionBefore);
    expect(decision.outcome).toBe('ACCEPT');
  });

  it('reviews a real artifact from Orchestrator and LocalHandlerRuntime', async () => {
    const result = await new Orchestrator({
      persistence: createInMemoryPersistence(),
      runtime: new LocalHandlerRuntime({ handlers: { 'agent-v1': () => ({ result: 'ok' }) } }),
      generateId: () => 'run-1',
      now: () => '2026-09-02T00:00:00.000Z',
    }).execute({
      id: 'task-review',
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
    const artifact = result.artifacts.find((item) => item.id === result.run.finalArtifactId);

    if (!artifact) {
      throw new Error('Orchestrator did not produce a final artifact');
    }

    const evaluation = evaluate(artifact);
    const review = reviewer.review(artifact, evaluation);

    expect(review.outcome).toBe('PASS');
    expect(review.artifactId).toBe(result.run.finalArtifactId);
    expect(review.evaluationId).toBe(evaluation.id);
  });
});
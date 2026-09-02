import { Artifact } from './types.js';
import { DeterministicEvaluator, EvaluationPolicy } from './validation.js';
import { StructuralReviewer } from './review.js';
import {
  BenchmarkCase,
  FailureMode,
  MetaEvaluation,
  MetaEvaluationSummary,
  createMetaEvaluation,
  summarizeMetaEvaluations,
} from './metaEvaluation.js';

export interface BenchmarkFixture {
  readonly benchmarkCase: BenchmarkCase;
  readonly artifact: Artifact;
  readonly evaluationPolicy: EvaluationPolicy;
}

export interface BenchmarkRun {
  readonly fixtures: readonly BenchmarkFixture[];
  readonly results: readonly MetaEvaluation[];
  readonly summary: MetaEvaluationSummary;
}

const benchmarkVersion = 'minimal-v1';

function fixture(
  id: string,
  content: unknown,
  referenceOutcome: 'PASS' | 'FAIL',
  failureMode: FailureMode,
  options: {
    contentType?: string;
    runId?: string;
    parentCaseId?: string;
    intervention?: string;
  } = {},
): BenchmarkFixture {
  const artifactId = `benchmark-artifact-${id}`;
  const policy: EvaluationPolicy = {
    id: 'benchmark-policy-v1',
    requiredContentType: 'application/json',
    requiredFields: ['result'],
  };
  const artifact: Artifact = {
    id: artifactId,
    runId: options.runId ?? `benchmark-run-${id}`,
    executionId: `benchmark-execution-${id}`,
    contentType: options.contentType ?? 'application/json',
    content,
  };
  const benchmarkCase: BenchmarkCase = Object.freeze({
    id: `benchmark-case-${id}`,
    artifactId,
    evaluationPolicyId: policy.id,
    reference: Object.freeze({
      id: `benchmark-reference-${id}`,
      outcome: referenceOutcome,
      evidence: Object.freeze([
        referenceOutcome === 'PASS' ? 'reference criteria satisfied' : `reference failure: ${failureMode}`,
      ]),
      rationale: referenceOutcome === 'PASS'
        ? 'artifact is expected to satisfy the benchmark policy'
        : 'artifact is expected to fail the benchmark policy',
      failureMode,
    }),
    benchmarkVersion,
    failureMode,
    parentCaseId: options.parentCaseId,
    intervention: options.intervention,
  });

  return Object.freeze({ benchmarkCase, artifact, evaluationPolicy: Object.freeze(policy) });
}

export const minimalBenchmark: readonly BenchmarkFixture[] = Object.freeze([
  fixture('valid', { result: 'ok' }, 'PASS', 'OTHER'),
  fixture('missing-output', { other: 'value' }, 'FAIL', 'MISSING_REQUIRED_OUTPUT'),
  fixture('invalid-type', { result: 'ok' }, 'FAIL', 'INVALID_ARTIFACT_TYPE', {
    contentType: 'text/plain',
    runId: 'benchmark-run-invalid-type',
  }),
  fixture('broken-provenance', { result: 'ok' }, 'PASS', 'BROKEN_PROVENANCE', { runId: '' }),
  fixture('policy-failure', { other: 'value' }, 'FAIL', 'POLICY_VIOLATION', {
    parentCaseId: 'benchmark-case-valid',
    intervention: 'remove required result field',
  }),
  fixture('known-false-positive', { result: 'ok' }, 'FAIL', 'INCONSISTENT_EVIDENCE'),
]);

export function runMinimalBenchmark(
  fixtures: readonly BenchmarkFixture[] = minimalBenchmark,
): BenchmarkRun {
  const evaluator = new DeterministicEvaluator();
  const reviewer = new StructuralReviewer({
    reviewerId: 'structural-reviewer',
    reviewerVersion: 'v1',
    createdAt: '2026-09-02T00:00:00.000Z',
  });
  const results = fixtures.map(({ benchmarkCase, artifact, evaluationPolicy }) => {
    const evaluation = evaluator.evaluate(artifact, evaluationPolicy);
    const review = reviewer.review(artifact, evaluation);

    return createMetaEvaluation(benchmarkCase, evaluation, review, {
      evaluatorId: 'deterministic-evaluator',
      evaluatorVersion: 'v1',
      reviewerId: 'structural-reviewer',
      reviewerVersion: 'v1',
    });
  });

  return Object.freeze({
    fixtures,
    results: Object.freeze(results),
    summary: summarizeMetaEvaluations(
      fixtures.map((fixtureItem) => fixtureItem.benchmarkCase),
      results,
    ),
  });
}
import { describe, expect, it } from '@jest/globals';
import {
  BenchmarkCase,
  compareBenchmarkVersions,
  createMetaEvaluation,
  FailureMode,
  summarizeMetaEvaluations,
} from '../src/metaEvaluation.js';
import { Review } from '../src/review.js';
import { Evaluation } from '../src/validation.js';

const benchmarkVersion = 'benchmark-v1';

function benchmarkCase(
  id: string,
  referenceOutcome: 'PASS' | 'FAIL',
  failureMode: FailureMode = referenceOutcome === 'PASS' ? 'OTHER' : 'POLICY_VIOLATION',
  parentCaseId?: string,
): BenchmarkCase {
  return Object.freeze({
    id,
    artifactId: `artifact-${id}`,
    evaluationPolicyId: 'policy-v1',
    reference: Object.freeze({
      id: `reference-${id}`,
      outcome: referenceOutcome,
      evidence: Object.freeze([referenceOutcome === 'PASS' ? 'criteria satisfied' : 'policy violation']),
      failureMode,
    }),
    benchmarkVersion,
    failureMode,
    parentCaseId,
    intervention: parentCaseId ? 'controlled intervention' : undefined,
  });
}

function evaluation(item: BenchmarkCase, passed: boolean, suffix = ''): Evaluation {
  return Object.freeze({
    id: `evaluation-${item.id}${suffix}`,
    artifactId: item.artifactId,
    policyId: item.evaluationPolicyId,
    passed,
    checks: Object.freeze([]),
  });
}

function review(item: BenchmarkCase, passed: boolean, suffix = ''): Review {
  return Object.freeze({
    id: `review-${item.id}${suffix}`,
    artifactId: item.artifactId,
    evaluationId: `evaluation-${item.id}${suffix}`,
    reviewerId: 'reviewer',
    reviewerVersion: 'v1',
    outcome: passed ? 'PASS' : 'FAIL',
    evidence: Object.freeze([]),
    rationale: 'structural result',
    createdAt: '2026-09-02T00:00:00.000Z',
  });
}

function meta(
  item: BenchmarkCase,
  observed: boolean,
  reviewerObserved?: boolean,
  version = 'evaluator-v1',
) {
  const observedEvaluation = evaluation(item, observed);
  return createMetaEvaluation(
    item,
    observedEvaluation,
    reviewerObserved === undefined ? undefined : review(item, reviewerObserved),
    {
      evaluatorId: 'deterministic-evaluator',
      evaluatorVersion: version,
      reviewerId: reviewerObserved === undefined ? undefined : 'reviewer',
      reviewerVersion: reviewerObserved === undefined ? undefined : 'v1',
    },
  );
}

describe('Meta-evaluation metrics', () => {
  it('classifies TP, TN, FP, and FN and calculates metrics mathematically', () => {
    const cases = [
      ...Array.from({ length: 2 }, (_, index) => benchmarkCase(`tp-${index}`, 'PASS')),
      ...Array.from({ length: 3 }, (_, index) => benchmarkCase(`tn-${index}`, 'FAIL')),
      benchmarkCase('fp', 'FAIL'),
      ...Array.from({ length: 4 }, (_, index) => benchmarkCase(`fn-${index}`, 'PASS')),
    ];
    const results = [
      ...cases.slice(0, 2).map((item) => meta(item, true)),
      ...cases.slice(2, 5).map((item) => meta(item, false)),
      meta(cases[5], true),
      ...cases.slice(6).map((item) => meta(item, false)),
    ];
    const summary = summarizeMetaEvaluations(cases, results);

    expect(summary.evaluator).toMatchObject({
      total: 10,
      truePositive: 2,
      trueNegative: 3,
      falsePositive: 1,
      falseNegative: 4,
      accuracy: 0.5,
      precision: 2 / 3,
      recall: 1 / 3,
      falsePositiveRate: 1 / 4,
      falseNegativeRate: 2 / 3,
    });
  });

  it('summarizes evaluator and reviewer agreement independently of correctness', () => {
    const pass = benchmarkCase('pass', 'PASS');
    const fail = benchmarkCase('fail', 'FAIL');
    const results = [
      meta(pass, true, false),
      meta(fail, true, true),
    ];
    const summary = summarizeMetaEvaluations([pass, fail], results);

    expect(summary.evaluator.falsePositive).toBe(1);
    expect(summary.reviewer?.falseNegative).toBe(1);
    expect(summary.agreements).toBe(1);
    expect(summary.disagreements).toBe(1);
    expect(summary.agreementRate).toBe(0.5);
  });

  it('supports evaluator-only meta-evaluation and explicit denominator-zero behavior', () => {
    const pass = benchmarkCase('pass-only', 'PASS');
    const summary = summarizeMetaEvaluations([pass], [meta(pass, true)]);

    expect(summary.reviewer).toBeUndefined();
    expect(summary.agreements).toBe(0);
    expect(summary.agreementRate).toBe(0);
    expect(summary.evaluator.falsePositiveRate).toBe(0);
    expect(summary.evaluator.falseNegativeRate).toBe(0);
    expect(Number.isNaN(summary.evaluator.accuracy)).toBe(false);
  });

  it('summarizes empty, failure-only, failure modes, and contrastive coverage', () => {
    const parent = benchmarkCase('case-a', 'PASS', 'OTHER');
    const variant = benchmarkCase('case-b', 'FAIL', 'BROKEN_PROVENANCE', parent.id);
    const empty = summarizeMetaEvaluations([], []);
    const summary = summarizeMetaEvaluations(
      [parent, variant],
      [meta(parent, true), meta(variant, false)],
    );

    expect(empty.coverage.totalCases).toBe(0);
    expect(summary.coverage.passCases).toBe(1);
    expect(summary.coverage.failCases).toBe(1);
    expect(summary.coverage.variantCases).toBe(1);
    expect(summary.coverage.casesByFailureMode.BROKEN_PROVENANCE).toBe(1);
    expect(summary.byFailureMode.BROKEN_PROVENANCE.trueNegative).toBe(1);
  });

  it('compares evaluator versions only on the same benchmark version', () => {
    const item = benchmarkCase('versioned', 'PASS');
    const first = summarizeMetaEvaluations([item], [meta(item, true, undefined, 'evaluator-v1')]);
    const second = summarizeMetaEvaluations([item], [meta(item, false, undefined, 'evaluator-v2')]);
    const comparison = compareBenchmarkVersions(first, second);

    expect(comparison.benchmarkVersion).toBe(benchmarkVersion);
    expect(comparison.evaluatorVersions).toEqual(['evaluator-v1', 'evaluator-v2']);
    expect(() => compareBenchmarkVersions(
      first,
      summarizeMetaEvaluations(
        [Object.freeze({ ...item, benchmarkVersion: 'benchmark-v2' })],
        [Object.freeze({ ...meta(item, true), benchmarkVersion: 'benchmark-v2' })],
      ),
    )).toThrow(/different benchmark versions/i);
    expect(() => compareBenchmarkVersions(
      first,
      summarizeMetaEvaluations([benchmarkCase('other-case', 'PASS')], [meta(benchmarkCase('other-case', 'PASS'), true)]),
    )).toThrow(/different benchmark case sets/i);
  });

  it('rejects an evaluation that references another artifact', () => {
    const item = benchmarkCase('artifact-link', 'PASS');

    expect(() => createMetaEvaluation(item, {
      ...evaluation(item, true),
      artifactId: 'other-artifact',
    })).toThrow(/artifact does not match benchmark case/i);
  });

  it('preserves immutable traceability identifiers and evidence', () => {
    const item = benchmarkCase('trace', 'FAIL', 'INCONSISTENT_EVIDENCE');
    const result = meta(item, true, true);

    expect(result.benchmarkCaseId).toBe(item.id);
    expect(result.evaluationId).toBe('evaluation-trace');
    expect(result.reviewId).toBe('review-trace');
    expect(result.referenceOutcome).toBe('FAIL');
    expect(result.evaluatorClassification).toBe('FALSE_POSITIVE');
    expect(result.reviewerClassification).toBe('FALSE_POSITIVE');
    expect(result.agreement).toBe('AGREEMENT');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
  });
});
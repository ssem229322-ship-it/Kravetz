import { describe, expect, it } from '@jest/globals';
import { minimalBenchmark, runMinimalBenchmark } from '../src/benchmark.js';

describe('Minimal benchmark', () => {
  it('contains six explicit cases with unique ids and references', () => {
    const caseIds = minimalBenchmark.map((fixture) => fixture.benchmarkCase.id);
    const referenceIds = minimalBenchmark.map((fixture) => fixture.benchmarkCase.reference.id);

    expect(minimalBenchmark).toHaveLength(6);
    expect(new Set(caseIds).size).toBe(caseIds.length);
    expect(new Set(referenceIds).size).toBe(referenceIds.length);
    expect(minimalBenchmark.every((fixture) => fixture.artifact.id === fixture.benchmarkCase.artifactId)).toBe(true);
    expect(minimalBenchmark.every((fixture) => fixture.evaluationPolicy.id === fixture.benchmarkCase.evaluationPolicyId)).toBe(true);
  });

  it('produces the expected classifications, agreements, and known error', () => {
    const run = runMinimalBenchmark();
    const byId = new Map(run.results.map((result) => [result.benchmarkCaseId, result]));

    expect(byId.get('benchmark-case-valid')?.evaluatorClassification).toBe('TRUE_POSITIVE');
    expect(byId.get('benchmark-case-missing-output')?.evaluatorClassification).toBe('TRUE_NEGATIVE');
    expect(byId.get('benchmark-case-broken-provenance')?.evaluatorClassification).toBe('TRUE_POSITIVE');
    expect(byId.get('benchmark-case-broken-provenance')?.reviewerClassification).toBe('FALSE_NEGATIVE');
    expect(byId.get('benchmark-case-broken-provenance')?.agreement).toBe('DISAGREEMENT');
    expect(byId.get('benchmark-case-known-false-positive')?.evaluatorClassification).toBe('FALSE_POSITIVE');
    expect(byId.get('benchmark-case-known-false-positive')?.reviewerClassification).toBe('FALSE_POSITIVE');
    expect(byId.get('benchmark-case-known-false-positive')?.agreement).toBe('AGREEMENT');
    expect(run.summary.evaluator.truePositive).toBe(2);
    expect(run.summary.evaluator.trueNegative).toBe(3);
    expect(run.summary.evaluator.falsePositive).toBe(1);
  });

  it('is deterministic and preserves disagreement on repeated runs', () => {
    const first = runMinimalBenchmark();
    const second = runMinimalBenchmark();

    expect(first).toEqual(second);
    expect(first.summary.disagreements).toBe(4);
    expect(first.summary.agreements).toBe(2);
  });
});
import { Evaluation } from './validation.js';
import { Review } from './review.js';

export type BenchmarkOutcome = 'PASS' | 'FAIL';

export type FailureMode =
  | 'MISSING_REQUIRED_OUTPUT'
  | 'INVALID_ARTIFACT_TYPE'
  | 'BROKEN_PROVENANCE'
  | 'POLICY_VIOLATION'
  | 'INCONSISTENT_EVIDENCE'
  | 'OTHER';

export interface Reference {
  readonly id: string;
  readonly outcome: BenchmarkOutcome;
  readonly evidence: readonly string[];
  readonly rationale?: string;
  readonly failureMode: FailureMode;
}

export interface BenchmarkCase {
  readonly id: string;
  readonly artifactId: string;
  readonly evaluationPolicyId: string;
  readonly reference: Reference;
  readonly benchmarkVersion: string;
  readonly failureMode: FailureMode;
  readonly parentCaseId?: string;
  readonly intervention?: string;
}

export type Classification =
  | 'TRUE_POSITIVE'
  | 'TRUE_NEGATIVE'
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE';

export type Agreement = 'AGREEMENT' | 'DISAGREEMENT';

export interface MetaEvaluation {
  readonly id: string;
  readonly benchmarkCaseId: string;
  readonly benchmarkVersion: string;
  readonly referenceOutcome: BenchmarkOutcome;
  readonly failureMode: FailureMode;
  readonly evaluationId?: string;
  readonly observedEvaluatorOutcome?: BenchmarkOutcome;
  readonly evaluatorClassification?: Classification;
  readonly evaluatorId?: string;
  readonly evaluatorVersion?: string;
  readonly reviewId?: string;
  readonly observedReviewerOutcome?: BenchmarkOutcome;
  readonly reviewerClassification?: Classification;
  readonly reviewerId?: string;
  readonly reviewerVersion?: string;
  readonly agreement?: Agreement;
  readonly evidence: readonly string[];
}

export interface MetricCounts {
  readonly total: number;
  readonly truePositive: number;
  readonly trueNegative: number;
  readonly falsePositive: number;
  readonly falseNegative: number;
  readonly accuracy: number;
  readonly precision: number;
  readonly recall: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
}

export interface BenchmarkCoverage {
  readonly benchmarkVersion: string;
  readonly totalCases: number;
  readonly passCases: number;
  readonly failCases: number;
  readonly casesByFailureMode: Readonly<Record<FailureMode, number>>;
  readonly variantCases: number;
}

export interface MetaEvaluationSummary {
  readonly benchmarkVersion: string;
  readonly caseIds: readonly string[];
  readonly evaluatorVersions: readonly string[];
  readonly reviewerVersions: readonly string[];
  readonly evaluator: MetricCounts;
  readonly reviewer?: MetricCounts;
  readonly agreements: number;
  readonly disagreements: number;
  readonly agreementRate: number;
  readonly coverage: BenchmarkCoverage;
  readonly byFailureMode: Readonly<Record<FailureMode, MetricCounts>>;
}

export interface BenchmarkVersionComparison {
  readonly benchmarkVersion: string;
  readonly evaluatorVersions: readonly string[];
  readonly summaries: readonly MetaEvaluationSummary[];
}

const failureModes: readonly FailureMode[] = [
  'MISSING_REQUIRED_OUTPUT',
  'INVALID_ARTIFACT_TYPE',
  'BROKEN_PROVENANCE',
  'POLICY_VIOLATION',
  'INCONSISTENT_EVIDENCE',
  'OTHER',
];

function emptyCounts(): MetricCounts {
  return {
    total: 0,
    truePositive: 0,
    trueNegative: 0,
    falsePositive: 0,
    falseNegative: 0,
    accuracy: 0,
    precision: 0,
    recall: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
  };
}

function calculateCounts(classifications: readonly Classification[]): MetricCounts {
  const truePositive = classifications.filter((item) => item === 'TRUE_POSITIVE').length;
  const trueNegative = classifications.filter((item) => item === 'TRUE_NEGATIVE').length;
  const falsePositive = classifications.filter((item) => item === 'FALSE_POSITIVE').length;
  const falseNegative = classifications.filter((item) => item === 'FALSE_NEGATIVE').length;
  const total = classifications.length;
  const safeDivide = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : numerator / denominator;

  return {
    total,
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    accuracy: safeDivide(truePositive + trueNegative, total),
    precision: safeDivide(truePositive, truePositive + falsePositive),
    recall: safeDivide(truePositive, truePositive + falseNegative),
    falsePositiveRate: safeDivide(falsePositive, falsePositive + trueNegative),
    falseNegativeRate: safeDivide(falseNegative, falseNegative + truePositive),
  };
}

export function classifyOutcome(
  reference: BenchmarkOutcome,
  observed: BenchmarkOutcome,
): Classification {
  if (reference === 'PASS' && observed === 'PASS') return 'TRUE_POSITIVE';
  if (reference === 'FAIL' && observed === 'FAIL') return 'TRUE_NEGATIVE';
  if (reference === 'FAIL' && observed === 'PASS') return 'FALSE_POSITIVE';
  if (reference === 'PASS' && observed === 'FAIL') return 'FALSE_NEGATIVE';
  throw new Error(`Invalid benchmark outcome pair: ${reference}/${observed}`);
}

export function agreementBetween(
  evaluator: BenchmarkOutcome,
  reviewer: BenchmarkOutcome,
): Agreement {
  return evaluator === reviewer ? 'AGREEMENT' : 'DISAGREEMENT';
}

export function createMetaEvaluation(
  benchmarkCase: BenchmarkCase,
  evaluation?: Evaluation,
  review?: Review,
  identities: {
    evaluatorId?: string;
    evaluatorVersion?: string;
    reviewerId?: string;
    reviewerVersion?: string;
  } = {},
): MetaEvaluation {
  if (evaluation && evaluation.policyId !== benchmarkCase.evaluationPolicyId) {
    throw new Error('Evaluation policy does not match benchmark case');
  }
  if (evaluation && evaluation.artifactId !== benchmarkCase.artifactId) {
    throw new Error('Evaluation artifact does not match benchmark case');
  }
  if (review && evaluation && review.evaluationId !== evaluation.id) {
    throw new Error('Review does not reference the supplied evaluation');
  }

  const observedEvaluatorOutcome = evaluation
    ? evaluation.passed ? 'PASS' : 'FAIL'
    : undefined;
  const observedReviewerOutcome = review
    ? review.outcome
    : undefined;
  const evaluatorClassification = observedEvaluatorOutcome
    ? classifyOutcome(benchmarkCase.reference.outcome, observedEvaluatorOutcome)
    : undefined;
  const reviewerClassification = observedReviewerOutcome
    ? classifyOutcome(benchmarkCase.reference.outcome, observedReviewerOutcome)
    : undefined;
  const agreement = observedEvaluatorOutcome && observedReviewerOutcome
    ? agreementBetween(observedEvaluatorOutcome, observedReviewerOutcome)
    : undefined;
  const evidence = [
    ...benchmarkCase.reference.evidence,
    ...(evaluation?.checks.map((check) => check.message) ?? []),
    ...(review?.evidence.map((check) => check.reason) ?? []),
  ];

  return Object.freeze({
    id: `meta-${benchmarkCase.id}-${evaluation?.id ?? 'none'}-${review?.id ?? 'none'}`,
    benchmarkCaseId: benchmarkCase.id,
    benchmarkVersion: benchmarkCase.benchmarkVersion,
    referenceOutcome: benchmarkCase.reference.outcome,
    failureMode: benchmarkCase.failureMode,
    evaluationId: evaluation?.id,
    observedEvaluatorOutcome,
    evaluatorClassification,
    evaluatorId: identities.evaluatorId,
    evaluatorVersion: identities.evaluatorVersion,
    reviewId: review?.id,
    observedReviewerOutcome,
    reviewerClassification,
    reviewerId: identities.reviewerId,
    reviewerVersion: identities.reviewerVersion,
    agreement,
    evidence: Object.freeze(evidence),
  });
}

export function summarizeMetaEvaluations(
  benchmarkCases: readonly BenchmarkCase[],
  results: readonly MetaEvaluation[],
): MetaEvaluationSummary {
  const benchmarkVersion = benchmarkCases[0]?.benchmarkVersion ?? results[0]?.benchmarkVersion ?? '';
  if (benchmarkCases.some((item) => item.benchmarkVersion !== benchmarkVersion)
    || results.some((item) => item.benchmarkVersion !== benchmarkVersion)) {
    throw new Error('All benchmark cases and meta-evaluations must use one benchmark version');
  }

  const evaluatorClassifications = results
    .map((item) => item.evaluatorClassification)
    .filter((item): item is Classification => item !== undefined);
  const reviewerClassifications = results
    .map((item) => item.reviewerClassification)
    .filter((item): item is Classification => item !== undefined);
  const casesByFailureMode = Object.fromEntries(
    failureModes.map((mode) => [mode, benchmarkCases.filter((item) => item.failureMode === mode).length]),
  ) as Record<FailureMode, number>;
  const byFailureMode = Object.fromEntries(
    failureModes.map((mode) => [
      mode,
      calculateCounts(results
        .filter((item) => item.failureMode === mode)
        .map((item) => item.evaluatorClassification)
        .filter((item): item is Classification => item !== undefined)),
    ]),
  ) as Record<FailureMode, MetricCounts>;
  const paired = results.filter(
    (item) => item.agreement !== undefined
      && item.observedEvaluatorOutcome !== undefined
      && item.observedReviewerOutcome !== undefined,
  );
  const agreements = paired.filter((item) => item.agreement === 'AGREEMENT').length;
  const passCases = benchmarkCases.filter((item) => item.reference.outcome === 'PASS').length;
  const evaluatorVersions = [...new Set(results
    .map((item) => item.evaluatorVersion)
    .filter((item): item is string => item !== undefined))];
  const reviewerVersions = [...new Set(results
    .map((item) => item.reviewerVersion)
    .filter((item): item is string => item !== undefined))];

  return Object.freeze({
    benchmarkVersion,
    caseIds: Object.freeze(benchmarkCases.map((item) => item.id)),
    evaluatorVersions: Object.freeze(evaluatorVersions),
    reviewerVersions: Object.freeze(reviewerVersions),
    evaluator: calculateCounts(evaluatorClassifications),
    reviewer: reviewerClassifications.length > 0 ? calculateCounts(reviewerClassifications) : undefined,
    agreements,
    disagreements: paired.length - agreements,
    agreementRate: paired.length === 0 ? 0 : agreements / paired.length,
    coverage: Object.freeze({
      benchmarkVersion,
      totalCases: benchmarkCases.length,
      passCases,
      failCases: benchmarkCases.length - passCases,
      casesByFailureMode: Object.freeze(casesByFailureMode),
      variantCases: benchmarkCases.filter((item) => item.parentCaseId !== undefined).length,
    }),
    byFailureMode: Object.freeze(byFailureMode),
  });
}

export function compareBenchmarkVersions(
  left: MetaEvaluationSummary,
  right: MetaEvaluationSummary,
): BenchmarkVersionComparison {
  if (left.benchmarkVersion !== right.benchmarkVersion) {
    throw new Error('Cannot compare different benchmark versions');
  }
  if (left.caseIds.length !== right.caseIds.length
    || left.caseIds.some((caseId, index) => caseId !== right.caseIds[index])) {
    throw new Error('Cannot compare different benchmark case sets');
  }
  return Object.freeze({
    benchmarkVersion: left.benchmarkVersion,
    evaluatorVersions: Object.freeze([
      ...new Set([...left.evaluatorVersions, ...right.evaluatorVersions]),
    ]),
    summaries: Object.freeze([left, right]),
  });
}
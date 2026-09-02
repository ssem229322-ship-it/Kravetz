import { AgentExecution, Artifact } from './types.js';
import { Decision, Evaluation, EvaluationPolicy } from './validation.js';
import { LearningRecord } from './learning.js';

export interface Hypothesis {
  readonly id: string;
  readonly statement: string;
  readonly sourceLearningRecordId?: string;
  readonly createdAt: string;
}

export interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly agentVersionId?: string;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export type ExperimentStatus = 'PENDING' | 'RUNNING' | 'COMPLETED';

export interface Experiment {
  readonly id: string;
  readonly hypothesisId: string;
  readonly baselineCandidateId: string;
  readonly candidateId: string;
  readonly status: ExperimentStatus;
  readonly createdAt: string;
}

export interface Comparison {
  readonly id: string;
  readonly baselineEvaluationId: string;
  readonly candidateEvaluationId: string;
  readonly policyId: string;
  readonly candidateAccepted: boolean;
  readonly criterion: string;
  readonly evidence: readonly string[];
}

export interface ExperimentResult {
  readonly experimentId: string;
  readonly baselineCandidateId: string;
  readonly candidateId: string;
  readonly baselineExecutionId: string;
  readonly candidateExecutionId: string;
  readonly baselineArtifactId: string;
  readonly candidateArtifactId: string;
  readonly baselineEvaluationId: string;
  readonly candidateEvaluationId: string;
  readonly comparison: Comparison;
  readonly decision: Decision;
}

export function hypothesisFromLearning(
  record: LearningRecord,
  statement: string,
  createdAt: string,
): Hypothesis {
  return Object.freeze({
    id: `hypothesis-${record.id}`,
    statement,
    sourceLearningRecordId: record.id,
    createdAt,
  });
}

export function compareEvaluations(
  baseline: Evaluation,
  candidate: Evaluation,
  policy: EvaluationPolicy,
): Comparison {
  if (baseline.policyId !== policy.id || candidate.policyId !== policy.id) {
    throw new Error('Baseline and candidate evaluations must use the supplied policy');
  }

  const candidateAccepted = candidate.passed && !baseline.passed;
  const evidence = candidateAccepted
    ? ['candidate passed while baseline failed']
    : ['available evaluations do not demonstrate candidate superiority'];

  return Object.freeze({
    id: `comparison-${baseline.id}-${candidate.id}`,
    baselineEvaluationId: baseline.id,
    candidateEvaluationId: candidate.id,
    policyId: policy.id,
    candidateAccepted,
    criterion: 'candidate passes and baseline fails under the same evaluation policy',
    evidence: Object.freeze(evidence),
  });
}

export function decideComparison(
  comparison: Comparison,
  candidateArtifactId: string,
): Decision {
  return Object.freeze({
    evaluationId: comparison.candidateEvaluationId,
    artifactId: candidateArtifactId,
    outcome: comparison.candidateAccepted ? 'ACCEPT' : 'REJECT',
    comparisonId: comparison.id,
    baselineEvaluationId: comparison.baselineEvaluationId,
    candidateEvaluationId: comparison.candidateEvaluationId,
    reason: comparison.evidence[0],
  });
}

export function createExperimentResult(
  experiment: Experiment,
  baselineCandidate: Candidate,
  candidate: Candidate,
  baselineExecution: AgentExecution,
  candidateExecution: AgentExecution,
  baselineArtifact: Artifact,
  candidateArtifact: Artifact,
  baselineEvaluation: Evaluation,
  candidateEvaluation: Evaluation,
  comparison: Comparison,
  decision: Decision,
): ExperimentResult {
  return Object.freeze({
    experimentId: experiment.id,
    baselineCandidateId: baselineCandidate.id,
    candidateId: candidate.id,
    baselineExecutionId: baselineExecution.id,
    candidateExecutionId: candidateExecution.id,
    baselineArtifactId: baselineArtifact.id,
    candidateArtifactId: candidateArtifact.id,
    baselineEvaluationId: baselineEvaluation.id,
    candidateEvaluationId: candidateEvaluation.id,
    comparison,
    decision,
  });
}
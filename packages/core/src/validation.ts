import { Artifact } from './types.js';

export interface EvaluationPolicy {
  id: string;
  requiredContentType?: string;
  requiredFields?: readonly string[];
}

export interface EvaluationCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface Evaluation {
  readonly id: string;
  readonly artifactId: string;
  readonly policyId: string;
  readonly passed: boolean;
  readonly checks: readonly EvaluationCheck[];
}

export interface Evaluator {
  evaluate(artifact: Artifact, policy: EvaluationPolicy): Evaluation;
}

export type DecisionOutcome = 'ACCEPT' | 'REJECT';

export interface Decision {
  readonly evaluationId: string;
  readonly artifactId: string;
  readonly outcome: DecisionOutcome;
  readonly comparisonId?: string;
  readonly baselineEvaluationId?: string;
  readonly candidateEvaluationId?: string;
  readonly reason?: string;
}

export class DeterministicEvaluator implements Evaluator {
  evaluate(artifact: Artifact, policy: EvaluationPolicy): Evaluation {
    const checks: EvaluationCheck[] = [];

    if (policy.requiredContentType !== undefined) {
      checks.push({
        name: 'contentType',
        passed: artifact.contentType === policy.requiredContentType,
        message: artifact.contentType === policy.requiredContentType
          ? 'content type matches policy'
          : `expected content type "${policy.requiredContentType}"`,
      });
    }

    for (const field of policy.requiredFields ?? []) {
      const content = artifact.content;
      const passed = content !== null
        && typeof content === 'object'
        && field in (content as Record<string, unknown>);

      checks.push({
        name: `field:${field}`,
        passed,
        message: passed ? `field "${field}" is present` : `missing field "${field}"`,
      });
    }

    const evaluation: Evaluation = {
      id: `evaluation-${artifact.id}-${policy.id}`,
      artifactId: artifact.id,
      policyId: policy.id,
      passed: checks.every((check) => check.passed),
      checks: Object.freeze(checks.map((check) => Object.freeze(check))),
    };

    return Object.freeze(evaluation);
  }
}

export function decide(evaluation: Evaluation): Decision {
  return Object.freeze({
    evaluationId: evaluation.id,
    artifactId: evaluation.artifactId,
    outcome: evaluation.passed ? 'ACCEPT' : 'REJECT',
  });
}
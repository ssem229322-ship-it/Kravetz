import { Artifact } from './types.js';
import { Evaluation } from './validation.js';

export interface ReviewCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly reason: string;
}

export type ReviewOutcome = 'PASS' | 'FAIL';

export interface Review {
  readonly id: string;
  readonly artifactId: string;
  readonly evaluationId: string;
  readonly reviewerId: string;
  readonly reviewerVersion: string;
  readonly outcome: ReviewOutcome;
  readonly evidence: readonly ReviewCheck[];
  readonly rationale: string;
  readonly createdAt: string;
}

export interface Reviewer {
  review(artifact: Artifact, evaluation: Evaluation): Review;
}

export interface StructuralReviewerOptions {
  readonly reviewerId: string;
  readonly reviewerVersion: string;
  readonly createdAt: string;
}

export class StructuralReviewer implements Reviewer {
  constructor(private readonly options: StructuralReviewerOptions) {}

  review(artifact: Artifact, evaluation: Evaluation): Review {
    const evidence: ReviewCheck[] = [
      {
        name: 'artifactIdentity',
        passed: artifact.id.length > 0,
        reason: artifact.id.length > 0
          ? 'artifact has an identity'
          : 'artifact id is empty',
      },
      {
        name: 'artifactProvenance',
        passed: artifact.runId.length > 0 && artifact.executionId.length > 0,
        reason: artifact.runId.length > 0 && artifact.executionId.length > 0
          ? 'artifact references its run and execution'
          : 'artifact provenance references are incomplete',
      },
      {
        name: 'evaluationArtifactRelationship',
        passed: evaluation.artifactId === artifact.id,
        reason: evaluation.artifactId === artifact.id
          ? 'evaluation references the reviewed artifact'
          : 'evaluation references a different artifact',
      },
    ];
    const passed = evidence.every((check) => check.passed);
    const review: Review = {
      id: `review-${artifact.id}-${evaluation.id}-${this.options.reviewerVersion}`,
      artifactId: artifact.id,
      evaluationId: evaluation.id,
      reviewerId: this.options.reviewerId,
      reviewerVersion: this.options.reviewerVersion,
      outcome: passed ? 'PASS' : 'FAIL',
      evidence: Object.freeze(evidence.map((check) => Object.freeze(check))),
      rationale: passed
        ? 'artifact and evaluation relationships are structurally coherent'
        : 'at least one artifact or evaluation relationship is structurally inconsistent',
      createdAt: this.options.createdAt,
    };

    return Object.freeze(review);
  }
}
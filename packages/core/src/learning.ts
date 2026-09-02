import { AgentExecution, Artifact } from './types.js';
import { Decision, Evaluation } from './validation.js';

export type LearningOutcome = 'SUCCESS' | 'FAILURE';

export interface LearningRecord {
  readonly id: string;
  readonly sourceRunId: string;
  readonly sourceExecutionId: string;
  readonly sourceArtifactId: string;
  readonly evaluationId: string;
  readonly decisionOutcome: Decision['outcome'];
  readonly outcome: LearningOutcome;
  readonly evidence: readonly string[];
  readonly lesson: string;
  readonly futureImplication: string;
}

export interface LearningContext {
  readonly records: readonly LearningRecord[];
}

export interface LearningStore {
  create(record: LearningRecord): void;
  get(recordId: string): LearningRecord | null;
}

export class InMemoryLearningStore implements LearningStore {
  private readonly records = new Map<string, LearningRecord>();

  create(record: LearningRecord): void {
    this.records.set(record.id, record);
  }

  get(recordId: string): LearningRecord | null {
    return this.records.get(recordId) ?? null;
  }
}

export function deriveLearningRecord(
  execution: AgentExecution,
  artifact: Artifact,
  evaluation: Evaluation,
  decision: Decision,
): LearningRecord {
  const passedChecks = evaluation.checks
    .filter((check) => check.passed)
    .map((check) => check.message);
  const failedChecks = evaluation.checks
    .filter((check) => !check.passed)
    .map((check) => check.message);
  const successful = decision.outcome === 'ACCEPT';
  const evidence = successful ? passedChecks : failedChecks;
  const evidenceSummary = evidence.join('; ');
  const outcome: LearningOutcome = successful ? 'SUCCESS' : 'FAILURE';

  const record: LearningRecord = {
    id: `learning-${execution.id}-${artifact.id}-${evaluation.id}`,
    sourceRunId: execution.runId,
    sourceExecutionId: execution.id,
    sourceArtifactId: artifact.id,
    evaluationId: evaluation.id,
    decisionOutcome: decision.outcome,
    outcome,
    evidence: Object.freeze([...evidence]),
    lesson: successful
      ? `The artifact satisfied the evaluated criteria: ${evidenceSummary}`
      : `Future artifacts must address the evaluated evidence: ${evidenceSummary}`,
    futureImplication: successful
      ? 'Preserve the characteristics demonstrated by this artifact in future executions.'
      : 'Consider the failed criteria when preparing future execution context.',
  };

  return Object.freeze(record);
}

export function createLearningContext(records: readonly LearningRecord[]): LearningContext {
  return Object.freeze({ records: Object.freeze([...records]) });
}
import { describe, expect, it } from '@jest/globals';
import { LocalHandlerRuntime } from '../src/agentRuntime.js';
import {
  Candidate,
  createExperimentResult,
  decideComparison,
  compareEvaluations,
  Experiment,
  hypothesisFromLearning,
} from '../src/experiments.js';
import { deriveLearningRecord } from '../src/learning.js';
import { createInMemoryPersistence } from '../src/inMemoryPersistence.js';
import { Orchestrator } from '../src/orchestrator.js';
import { AgentExecution, Artifact } from '../src/types.js';
import { decide, DeterministicEvaluator, EvaluationPolicy } from '../src/validation.js';

const policy: EvaluationPolicy = {
  id: 'experiment-policy',
  requiredContentType: 'application/json',
  requiredFields: ['result'],
};

const baseline: Candidate = { id: 'baseline', label: 'baseline', agentVersionId: 'agent-baseline' };
const candidate: Candidate = { id: 'candidate', label: 'candidate', agentVersionId: 'agent-candidate' };
const experiment: Experiment = {
  id: 'experiment-1',
  hypothesisId: 'hypothesis-1',
  baselineCandidateId: baseline.id,
  candidateId: candidate.id,
  status: 'COMPLETED',
  createdAt: '2026-09-02T00:00:00.000Z',
};

function standaloneEvaluation(content: unknown, artifactId: string) {
  const artifact: Artifact = {
    id: artifactId,
    runId: `run-${artifactId}`,
    executionId: `execution-${artifactId}`,
    contentType: 'application/json',
    content,
  };
  return new DeterministicEvaluator().evaluate(artifact, policy);
}

describe('Experiments and candidate comparison', () => {
  it('creates explicit hypotheses and can derive one from a LearningRecord', () => {
    const sourceExecution: AgentExecution = {
      id: 'execution-learning',
      runId: 'run-learning',
      stepId: 'step-learning',
      status: 'completed',
      input: {},
      outputArtifactIds: ['artifact-learning'],
    };
    const sourceArtifact: Artifact = {
      id: 'artifact-learning',
      runId: sourceExecution.runId,
      executionId: sourceExecution.id,
      contentType: 'application/json',
      content: { other: 'value' },
    };
    const evaluation = new DeterministicEvaluator().evaluate(sourceArtifact, policy);
    const learning = deriveLearningRecord(
      sourceExecution,
      sourceArtifact,
      evaluation,
      decide(evaluation),
    );
    const hypothesis = hypothesisFromLearning(
      learning,
      'Including result will satisfy the policy.',
      '2026-09-02T00:00:00.000Z',
    );

    expect(hypothesis.sourceLearningRecordId).toBe(learning.id);
    expect(hypothesis.statement).toContain('result');
    expect(hypothesis.createdAt).toBe('2026-09-02T00:00:00.000Z');
  });

  it('represents baseline and candidate references in an experiment', () => {
    expect(experiment.hypothesisId).toBe('hypothesis-1');
    expect(experiment.baselineCandidateId).toBe(baseline.id);
    expect(experiment.candidateId).toBe(candidate.id);
    expect(experiment.status).toBe('COMPLETED');
  });

  it('executes and evaluates baseline and candidate through the real Kraken path', async () => {
    async function execute(agentVersionId: string, content: unknown) {
      return new Orchestrator({
        persistence: createInMemoryPersistence(),
        runtime: new LocalHandlerRuntime({ handlers: { [agentVersionId]: () => content } }),
        generateId: () => `run-${agentVersionId}`,
        now: () => '2026-09-02T00:00:00.000Z',
      }).execute({
        id: `task-${agentVersionId}`,
        input: {},
        workflowDefinition: {
          steps: [{ id: 'step-1', agentVersionId, inputMapping: {} }],
          onStepError: 'abort',
          finalStepId: 'step-1',
        },
        status: 'pending',
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      });
    }

    const baselineRun = await execute(baseline.agentVersionId!, { other: 'value' });
    const candidateRun = await execute(candidate.agentVersionId!, { result: 'ok' });
    const baselineArtifact = baselineRun.artifacts[0];
    const candidateArtifact = candidateRun.artifacts[0];
    const baselineEvaluation = new DeterministicEvaluator().evaluate(baselineArtifact, policy);
    const candidateEvaluation = new DeterministicEvaluator().evaluate(candidateArtifact, policy);
    const comparison = compareEvaluations(baselineEvaluation, candidateEvaluation, policy);
    const decision = decideComparison(comparison, candidateArtifact.id);
    const result = createExperimentResult(
      experiment,
      baseline,
      candidate,
      baselineRun.executions[0],
      candidateRun.executions[0],
      baselineArtifact,
      candidateArtifact,
      baselineEvaluation,
      candidateEvaluation,
      comparison,
      decision,
    );

    expect(result.baselineArtifactId).toBe(baselineRun.run.finalArtifactId);
    expect(result.candidateArtifactId).toBe(candidateRun.run.finalArtifactId);
    expect(result.comparison.candidateAccepted).toBe(true);
    expect(result.decision.outcome).toBe('ACCEPT');
    expect(result.decision.reason).toContain('candidate passed');
  });

  it('rejects a candidate when the evidence does not prove superiority', () => {
    const baselineEvaluation = standaloneEvaluation({ result: 'ok' }, 'baseline-artifact');
    const candidateEvaluation = standaloneEvaluation({ result: 'also-ok' }, 'candidate-artifact');
    const comparison = compareEvaluations(baselineEvaluation, candidateEvaluation, policy);
    const decision = decideComparison(comparison, candidateEvaluation.artifactId);

    expect(comparison.candidateAccepted).toBe(false);
    expect(decision.outcome).toBe('REJECT');
    expect(decision.reason).toContain('do not demonstrate');
  });

  it('is deterministic and does not modify candidate or model configuration', () => {
    const baselineEvaluation = standaloneEvaluation({ other: 'value' }, 'baseline-artifact');
    const candidateEvaluation = standaloneEvaluation({ result: 'ok' }, 'candidate-artifact');
    const first = compareEvaluations(baselineEvaluation, candidateEvaluation, policy);
    const second = compareEvaluations(baselineEvaluation, candidateEvaluation, policy);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(candidate.configuration).toBeUndefined();
    expect(candidate.agentVersionId).toBe('agent-candidate');
  });
});
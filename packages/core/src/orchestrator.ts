import {
  AgentExecution,
  Artifact,
  Run,
  Task,
} from './types.js';
import { AgentRuntime } from './agentRuntime.js';
import { Persistence } from './persistence.js';

export interface OrchestratorDependencies {
  runtime: AgentRuntime;
  persistence: Persistence;
  generateId: () => string;
  now: () => string;
}

export interface OrchestratorResult {
  task: Task;
  run: Run;
  executions: AgentExecution[];
  artifacts: Artifact[];
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDependencies) {}

  private static resolveInputField(
    input: Record<string, unknown>,
    path: string,
  ): unknown {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, input as unknown);
  }

  private static validateWorkflow(task: Task): void {
    const steps = task.workflowDefinition.steps;

    if (steps.length === 0) {
      throw new Error('Workflow definition must contain at least one step');
    }

    const stepIds = new Set<string>();
    for (const step of steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step id "${step.id}" in workflow definition`);
      }
      stepIds.add(step.id);
    }

    const finalStepId = task.workflowDefinition.finalStepId;
    if (!finalStepId || !steps.some((step) => step.id === finalStepId)) {
      throw new Error(
        `Workflow finalStepId "${String(finalStepId)}" does not match any step id`,
      );
    }

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];

      for (const [key, mapping] of Object.entries(step.inputMapping)) {
        if (mapping.startsWith('$input.')) {
          const field = mapping.slice('$input.'.length);
          const value = this.resolveInputField(task.input, field);

          if (value === undefined) {
            throw new Error(
              `Step "${step.id}" references missing $input field "${field}" for key "${key}"`,
            );
          }

          continue;
        }

        if (!mapping.startsWith('$prev.')) {
          continue;
        }

        const dependencyId = mapping.slice('$prev.'.length).split('.')[0];
        const dependencyIndex = steps.findIndex((candidate) => candidate.id === dependencyId);

        if (dependencyIndex === -1) {
          throw new Error(
            `Step "${step.id}" references unknown $prev step "${dependencyId}" for key "${key}"`,
          );
        }

        if (dependencyIndex >= index) {
          throw new Error(
            `Step "${step.id}" references a future or current step "${dependencyId}" via $prev`,
          );
        }
      }
    }
  }

  async execute(task: Task): Promise<OrchestratorResult> {
    const { persistence, runtime, generateId, now } = this.deps;
    Orchestrator.validateWorkflow(task);

    const run: Run = {
      id: generateId(),
      taskId: task.id,
      status: 'running',
      startedAt: now(),
    };

    await persistence.runs.create(run);

    const runningTask: Task = {
      ...task,
      status: 'running',
      updatedAt: now(),
    };

    await persistence.tasks.update(runningTask);

    const executions: AgentExecution[] = [];
    const artifacts: Artifact[] = [];
    const completedArtifacts = new Map<string, Artifact[]>();
    const failedSteps = new Set<string>();

    for (const step of task.workflowDefinition.steps) {
      const dependencyStepIds = Object.values(step.inputMapping)
        .filter((value) => value.startsWith('$prev.'))
        .map((value) => value.slice('$prev.'.length).split('.')[0]);

      const blockedBy = dependencyStepIds.find((id) => failedSteps.has(id));

      const execution: AgentExecution = {
        id: generateId(),
        runId: run.id,
        stepId: step.id,
        status: blockedBy ? 'skipped' : 'pending',
        input: {},
        outputArtifactIds: [],
      };

      if (blockedBy) {
        execution.error = `dependency_failed:${blockedBy}`;
        await persistence.executions.create(execution);
        executions.push(execution);
        continue;
      }

      const input: Record<string, unknown> = {};

      for (const [key, mapping] of Object.entries(step.inputMapping)) {
        if (mapping.startsWith('$input.')) {
          const field = mapping.slice('$input.'.length);
          input[key] = task.input[field];
          continue;
        }

        if (mapping.startsWith('$prev.')) {
          const expression = mapping.slice('$prev.'.length);
          const [stepId, artifactIndex] = expression.split('.');
          const previousArtifacts = completedArtifacts.get(stepId) ?? [];

          if (artifactIndex === undefined) {
            input[key] = previousArtifacts;
          } else {
            const index = Number(artifactIndex);
            input[key] = previousArtifacts[index] ?? null;
          }

          continue;
        }

        input[key] = mapping;
      }

      execution.input = input;
      execution.status = 'running';
      await persistence.executions.create(execution);

      try {
        const result = await runtime.execute({
          execution,
          step,
        });

        const producedArtifacts = result.artifacts ?? [];
        const runtimeOutputArtifactIds =
          result.execution.outputArtifactIds?.length > 0
            ? result.execution.outputArtifactIds
            : producedArtifacts.map((artifact) => artifact.id);

        execution.status = result.execution.status;
        execution.outputArtifactIds = runtimeOutputArtifactIds;
        execution.model = result.execution.model;
        execution.provider = result.execution.provider;
        execution.inputTokens = result.execution.inputTokens;
        execution.outputTokens = result.execution.outputTokens;
        execution.latencyMs = result.execution.latencyMs;
        execution.error = result.execution.error;

        for (const artifact of producedArtifacts) {
          await persistence.artifacts.create(artifact);
          artifacts.push(artifact);
        }

        await persistence.executions.update(execution);
        executions.push(execution);

        if (execution.status === 'completed') {
          completedArtifacts.set(step.id, producedArtifacts);
        } else if (execution.status === 'failed') {
          failedSteps.add(step.id);

          if (task.workflowDefinition.onStepError === 'abort') {
            break;
          }
        }
      } catch (error) {
        execution.status = 'failed';
        execution.error =
          error instanceof Error ? error.message : String(error);

        await persistence.executions.update(execution);
        executions.push(execution);

        failedSteps.add(step.id);

        if (task.workflowDefinition.onStepError === 'abort') {
          break;
        }
      }
    }

    const hasFailed = executions.some(
      (execution) => execution.status === 'failed',
    );
    const hasSkipped = executions.some(
      (execution) => execution.status === 'skipped',
    );

    run.status = hasFailed ? 'failed' : hasSkipped ? 'partial' : 'completed';
    run.completedAt = now();

    const finalStepId =
      task.workflowDefinition.finalStepId ??
      task.workflowDefinition.steps[task.workflowDefinition.steps.length - 1]?.id;

    const finalExecution = finalStepId
      ? [...executions]
          .reverse()
          .find(
            (execution) =>
              execution.stepId === finalStepId && execution.status === 'completed',
          )
      : [...executions].reverse().find((execution) => execution.status === 'completed');

    const finalArtifacts = finalStepId
      ? completedArtifacts.get(finalStepId)
      : undefined;

    if (finalExecution && finalExecution.outputArtifactIds.length > 0) {
      run.finalArtifactId = finalExecution.outputArtifactIds[0];
    } else if (finalArtifacts && finalArtifacts.length > 0) {
      run.finalArtifactId = finalArtifacts[0].id;
    }

    await persistence.runs.update(run);

    const finalTask: Task = {
      ...runningTask,
      status:
        run.status === 'completed'
          ? 'completed'
          : run.status === 'failed'
            ? 'failed'
            : 'running',
      updatedAt: now(),
    };

    await persistence.tasks.update(finalTask);

    return {
      task: finalTask,
      run,
      executions,
      artifacts,
    };
  }
}

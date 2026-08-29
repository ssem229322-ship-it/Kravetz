import { describe, expect, it } from '@jest/globals';
import { Orchestrator } from "../src/orchestrator.js";
import type {
  AgentExecution,
  Artifact,
  Run,
  Task,
  WorkflowStep,
} from '../src/types.js';
import type { AgentRuntime } from '../src/agentRuntime.js';
import type { Persistence } from '../src/persistence.js';

function createPersistence(): Persistence {
  const tasks = new Map<string, Task>();
  const runs = new Map<string, Run>();
  const executions = new Map<string, AgentExecution>();
  const artifacts = new Map<string, Artifact>();

  return {
    tasks: {
      async create(task) {
        tasks.set(task.id, task);
      },
      async get(taskId) {
        return tasks.get(taskId) ?? null;
      },
      async update(task) {
        tasks.set(task.id, task);
      },
    },

    runs: {
      async create(run) {
        runs.set(run.id, run);
      },
      async get(runId) {
        return runs.get(runId) ?? null;
      },
      async listByTask(taskId) {
        return [...runs.values()].filter((run) => run.taskId === taskId);
      },
      async update(run) {
        runs.set(run.id, run);
      },
    },

    executions: {
      async create(execution) {
        executions.set(execution.id, execution);
      },
      async get(executionId) {
        return executions.get(executionId) ?? null;
      },
      async listByRun(runId) {
        return [...executions.values()].filter(
          (execution) => execution.runId === runId,
        );
      },
      async update(execution) {
        executions.set(execution.id, execution);
      },
    },

    artifacts: {
      async create(artifact) {
        artifacts.set(artifact.id, artifact);
      },
      async get(artifactId) {
        return artifacts.get(artifactId) ?? null;
      },
      async listByRun(runId) {
        return [...artifacts.values()].filter(
          (artifact) => artifact.runId === runId,
        );
      },
    },
  };
}

function createRuntime(): AgentRuntime {
  return {
    async execute({ execution }) {
      const artifact: Artifact = {
        id: `artifact-${execution.stepId}`,
        runId: execution.runId,
        executionId: execution.id,
        contentType: 'text/plain',
        content: execution.input,
      };

      return {
        execution: {
          ...execution,
          status: 'completed',
          outputArtifactIds: [artifact.id],
        },
        artifacts: [artifact],
      };
    },
  };
}

function createTask(
  steps: WorkflowStep[],
  onStepError: 'abort' | 'continue' = 'abort',
): Task {
  return {
    id: 'task-1',
    userId: 'user-1',
    input: {
      message: 'hello',
    },
    workflowDefinition: {
      steps,
      onStepError,
      finalStepId: steps[steps.length - 1].id,
    },
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('Orchestrator', () => {
  it('executes a workflow and persists its result', async () => {
    const persistence = createPersistence();
    const runtime = createRuntime();

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: (() => {
        let counter = 0;
        return () => `id-${++counter}`;
      })(),
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const task = createTask([
      {
        id: 'step-1',
        agentVersionId: 'agent-v1',
        inputMapping: {
          message: '$input.message',
        },
      },
    ]);

    const result = await orchestrator.execute(task);

    expect(result.run.status).toBe('completed');
    expect(result.task.status).toBe('completed');

    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe('completed');
    expect(result.executions[0].input).toEqual({
      message: 'hello',
    });

    expect(result.artifacts).toHaveLength(1);
    expect(result.run.finalArtifactId).toBe(result.artifacts[0].id);
  });
});

describe('Orchestrator E2E - two step workflow', () => {
  it('executes two steps and chains artifacts', async () => {
    const artifacts: Artifact[] = [];
    const executions: AgentExecution[] = [];
    const runs: Run[] = [];

    const persistence = {
      tasks: {
        getById: async () => task,
        update: async (updatedTask: Task) => updatedTask,
      },
      runs: {
        create: async (run: Run) => {
          runs.push(run);
          return run;
        },
        update: async (run: Run) => {
          const index = runs.findIndex((item) => item.id === run.id);
          if (index >= 0) runs[index] = run;
          return run;
        },
      },
      executions: {
        create: async (execution: AgentExecution) => {
          executions.push(execution);
          return execution;
        },
        update: async (execution: AgentExecution) => {
          const index = executions.findIndex((item) => item.id === execution.id);
          if (index >= 0) executions[index] = execution;
          return execution;
        },
      },
      artifacts: {
        create: async (artifact: Artifact) => {
          artifacts.push(artifact);
          return artifact;
        },
      },
    } as any;

    const runtimeInputs: Record<string, unknown>[] = [];

    const runtime: AgentRuntime = {
      execute: async ({ step, execution }) => {
        runtimeInputs.push(execution.input);
        return ({
        execution: {
          ...execution,
          status: 'completed',
        },
        artifacts: [
          {
            id: `artifact-${step.id}`,
            runId: execution.runId,
            executionId: execution.id,
            contentType: 'application/json',
            content: {
              step: step.id,
              result: 'ok',
            },
          },
        ],
        });
      },
    };

    const task: Task = {
      id: 'task-e2e',
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'patentes/v1',
            inputMapping: {},
          },
          {
            id: 'step-2',
            agentVersionId: 'validator/v1',
            inputMapping: {
              input: '$prev.step-1',
            },
          },
        ],
        onStepError: 'abort',
        finalStepId: 'step-2',
      },
    } as Task;

    const orchestrator = new Orchestrator({
      runtime,
      persistence,
      generateId: (() => {
        let n = 0;
        return () => `e2e-${++n}`;
      })(),
      now: () => '2026-08-29T00:00:00.000Z',
    });

    const result = await orchestrator.execute(task);

    expect(result.run).toBeDefined();
    expect(result.executions).toHaveLength(2);
    expect(result.artifacts).toHaveLength(2);
    expect(result.run.finalArtifactId).toBe('artifact-step-2');
    expect(runtimeInputs).toHaveLength(2);
    expect(runtimeInputs[1]).toEqual(expect.objectContaining({
      input: expect.anything(),
    }));
    expect(executions).toHaveLength(2);
    expect(artifacts).toHaveLength(2);
  });
});

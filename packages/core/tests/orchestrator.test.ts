import { describe, expect, it } from '@jest/globals';
import { Orchestrator } from "../src/orchestrator.js";
import type {
  AgentExecution,
  Artifact,
  Run,
  Task,
  WorkflowStep,
} from '../src/types.js';
import { LocalHandlerRuntime } from '../src/agentRuntime.js';
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
      async createMany(taskList) {
        taskList.forEach(t => tasks.set(t.id, t));
      },
      async get(taskId) {
        return tasks.get(taskId) ?? null;
      },
      async getMany(taskIds) {
        const result = new Map<string, Task | null>();
        taskIds.forEach(id => result.set(id, tasks.get(id) ?? null));
        return result;
      },
      async update(task) {
        tasks.set(task.id, task);
      },
      async updateMany(taskList) {
        taskList.forEach(t => tasks.set(t.id, t));
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

describe('Orchestrator validation', () => {
  it('rejects duplicate step ids in the workflow definition', async () => {
    const orchestrator = new Orchestrator({
      persistence: createPersistence(),
      runtime: createRuntime(),
      generateId: () => 'id-1',
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const task = createTask([
      { id: 'step-1', agentVersionId: 'agent-v1', inputMapping: {} },
      { id: 'step-1', agentVersionId: 'agent-v2', inputMapping: {} },
    ]);

    await expect(orchestrator.execute(task)).rejects.toThrow(/duplicate step id/i);
  });

  it('rejects missing $input fields before running steps', async () => {
    const orchestrator = new Orchestrator({
      persistence: createPersistence(),
      runtime: createRuntime(),
      generateId: () => 'id-1',
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const task = createTask([
      {
        id: 'step-1',
        agentVersionId: 'agent-v1',
        inputMapping: { message: '$input.missingField' },
      },
    ]);

    await expect(orchestrator.execute(task)).rejects.toThrow(/\$input.*missingField/i);
  });

 
  it('rejects unknown $prev step references before running steps', async () => {
    const orchestrator = new Orchestrator({
      persistence: createPersistence(),
      runtime: createRuntime(),
      generateId: () => 'id-1',
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const task = createTask([
      {
        id: 'step-1',
        agentVersionId: 'agent-v1',
        inputMapping: { output: '$prev.missing-step' },
      },
    ]);

    await expect(orchestrator.execute(task)).rejects.toThrow(/\$prev.*missing-step/i);
  });

  it('rejects $prev references to future steps according to current execution semantics', async () => {
    const orchestrator = new Orchestrator({
      persistence: createPersistence(),
      runtime: createRuntime(),
      generateId: () => 'id-1',
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const task = createTask([
      {
        id: 'step-1',
        agentVersionId: 'agent-v1',
        inputMapping: {},
      },
      {
        id: 'step-2',
        agentVersionId: 'agent-v2',
        inputMapping: { output: '$prev.step-3' },
      },
      {
        id: 'step-3',
        agentVersionId: 'agent-v3',
        inputMapping: {},
      },
    ]);

    await expect(orchestrator.execute(task)).rejects.toThrow(/future or current step/i);
  });

  it('skips transitive dependencies when an upstream step fails', async () => {
    const persistence = createPersistence();
    const runtime: AgentRuntime = {
      async execute({ execution, step }) {
        if (step.id === 'step-1') {
          return {
            execution: {
              ...execution,
              status: 'failed',
              error: 'boom',
              outputArtifactIds: [],
            },
            artifacts: [],
          };
        }

        const artifact: Artifact = {
          id: `artifact-${step.id}`,
          runId: execution.runId,
          executionId: execution.id,
          contentType: 'application/json',
          content: { step: step.id },
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

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: (() => {
        let counter = 0;
        return () => `transitive-${++counter}`;
      })(),
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const task = createTask([
      { id: 'step-1', agentVersionId: 'agent-a', inputMapping: {} },
      { id: 'step-2', agentVersionId: 'agent-b', inputMapping: { value: '$prev.step-1' } },
      { id: 'step-3', agentVersionId: 'agent-c', inputMapping: { value: '$prev.step-2' } },
    ], 'continue');

    const result = await orchestrator.execute(task);

    expect(result.executions.map((execution) => execution.status)).toEqual([
      'failed',
      'skipped',
      'skipped',
    ]);
    expect(result.executions[2].error).toBe('dependency_failed:step-2');
    expect(result.run.status).toBe('partial');
  });
});

describe('Execution containment', () => {
  it('marks a hanging handler as failed instead of waiting indefinitely', async () => {
    const persistence = createPersistence();
    const runtime = new LocalHandlerRuntime({
      handlers: {
        'slow-agent': async () => {
          await new Promise(() => undefined);
          return { value: 'never' };
        },
      },
    });

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: (() => {
        let counter = 0;
        return () => `timeout-${++counter}`;
      })(),
      now: () => '2026-08-30T00:00:00.000Z',
    });

    const task: Task = {
      id: 'task-timeout',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'slow-agent',
            inputMapping: { message: '$input.message' },
          },
        ],
        onStepError: 'abort',
        finalStepId: 'step-1',
      },
      status: 'pending',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const start = Date.now();
    const result = await orchestrator.execute(task, { timeoutMs: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe('failed');
    expect(result.executions[0].error).toBe('timeout');
    expect(result.run.status).toBe('failed');
    expect(result.task.status).toBe('failed');
  });

  it('preserves abort semantics when a step times out', async () => {
    const persistence = createPersistence();
    const runtime = new LocalHandlerRuntime({
      handlers: {
        'slow-agent': async () => {
          await new Promise(() => undefined);
          return { value: 'never' };
        },
        'ok-agent': (input) => ({ value: (input as Record<string, unknown>).message }),
      },
    });

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: (() => {
        let counter = 0;
        return () => `abort-${++counter}`;
      })(),
      now: () => '2026-08-30T00:00:00.000Z',
    });

    const task: Task = {
      id: 'task-timeout-abort',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'slow-agent',
            inputMapping: { message: '$input.message' },
          },
          {
            id: 'step-2',
            agentVersionId: 'ok-agent',
            inputMapping: { message: '$input.message' },
          },
        ],
        onStepError: 'abort',
        finalStepId: 'step-2',
      },
      status: 'pending',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const result = await orchestrator.execute(task, { timeoutMs: 50 });

    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe('failed');
    expect(result.executions[0].error).toBe('timeout');
    expect(result.run.status).toBe('failed');
  });

  it('preserves continue semantics when a step times out', async () => {
    const persistence = createPersistence();
    const runtime = new LocalHandlerRuntime({
      handlers: {
        'slow-agent': async () => {
          await new Promise(() => undefined);
          return { value: 'never' };
        },
        'ok-agent': (input) => ({ value: (input as Record<string, unknown>).message }),
      },
    });

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: (() => {
        let counter = 0;
        return () => `continue-${++counter}`;
      })(),
      now: () => '2026-08-30T00:00:00.000Z',
    });

    const task: Task = {
      id: 'task-timeout-continue',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'slow-agent',
            inputMapping: { message: '$input.message' },
          },
          {
            id: 'step-2',
            agentVersionId: 'ok-agent',
            inputMapping: { message: '$input.message' },
          },
        ],
        onStepError: 'continue',
        finalStepId: 'step-2',
      },
      status: 'pending',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const result = await orchestrator.execute(task, { timeoutMs: 50 });

    expect(result.executions).toHaveLength(2);
    expect(result.executions[0].status).toBe('failed');
    expect(result.executions[0].error).toBe('timeout');
    expect(result.executions[1].status).toBe('completed');
    expect(result.run.status).toBe('partial');
  });
});

describe('LocalHandlerRuntime', () => {
  it('executes a concrete local handler end-to-end across two steps', async () => {
    const persistence = createPersistence();
    const runtime = new LocalHandlerRuntime({
      handlers: {
        'step-1-agent': (input) => ({
          value: `${String((input as Record<string, unknown>).message)}-processed`,
        }),
        'step-2-agent': (input) => {
          const artifact = (input as Record<string, unknown>).value as Record<string, unknown>;
          const previousValue = artifact.content as Record<string, unknown>;
          return { value: `final:${String(previousValue.value)}` };
        },
      },
    });

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: (() => {
        let counter = 0;
        return () => `runtime-${++counter}`;
      })(),
      now: () => '2026-08-30T00:00:00.000Z',
    });

    const task: Task = {
      id: 'task-runtime-e2e',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'step-1-agent',
            inputMapping: { message: '$input.message' },
          },
          {
            id: 'step-2',
            agentVersionId: 'step-2-agent',
            inputMapping: { value: '$prev.step-1.0' },
          },
        ],
        onStepError: 'abort',
        finalStepId: 'step-2',
      },
      status: 'pending',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const result = await orchestrator.execute(task);

    expect(result.executions).toHaveLength(2);
    expect(result.artifacts).toHaveLength(2);
    expect(result.executions.every((execution) => execution.status === 'completed')).toBe(true);
    expect(result.run.status).toBe('completed');
    expect(result.task.status).toBe('completed');
    expect(result.run.finalArtifactId).toBe('artifact-step-2');
    expect(result.artifacts[1].content).toEqual({ value: 'final:hello-processed' });
  });

  it('preserves abort semantics when a local handler fails', async () => {
    const persistence = createPersistence();
    const runtime = new LocalHandlerRuntime({
      handlers: {
        'failing-agent': () => {
          throw new Error('boom');
        },
        'ok-agent': (input) => ({ value: (input as Record<string, unknown>).message }),
      },
    });

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: () => 'runtime-fail',
      now: () => '2026-08-30T00:00:00.000Z',
    });

    const task: Task = {
      id: 'task-runtime-abort',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'failing-agent',
            inputMapping: { value: '$input.message' },
          },
          {
            id: 'step-2',
            agentVersionId: 'ok-agent',
            inputMapping: { message: '$input.message' },
          },
        ],
        onStepError: 'abort',
        finalStepId: 'step-2',
      },
      status: 'pending',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const result = await orchestrator.execute(task);

    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe('failed');
    expect(result.run.status).toBe('failed');
    expect(result.task.status).toBe('failed');
  });

  it('preserves continue semantics when a local handler fails', async () => {
    // Test case verifies workflow continues after failure 
    // when onStepError='continue'
    const persistence = createPersistence();
    const runtime = new LocalHandlerRuntime({
      handlers: {
        'failing-agent': () => {
          throw new Error('boom');
        },
        'ok-agent': (input) => ({ value: (input as Record<string, unknown>).message }),
      },
    });

    const orchestrator = new Orchestrator({
      persistence,
      runtime,
      generateId: () => 'runtime-continue',
      now: () => '2026-08-30T00:00:00.000Z',
    });

    const task: Task = {
      id: 'task-runtime-continue',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'failing-agent',
            inputMapping: { value: '$input.message' },
          },
          {
            id: 'step-2',
            agentVersionId: 'ok-agent',
            inputMapping: { message: '$input.message' },
          },
        ],
        onStepError: 'continue',
        finalStepId: 'step-2',
      },
      status: 'pending',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const result = await orchestrator.execute(task);

    expect(result.executions).toHaveLength(2);
    expect(result.executions[0].status).toBe('failed');
    expect(result.executions[1].status).toBe('completed');
    expect(result.run.status).toBe('partial');
  });
});
 
 
 

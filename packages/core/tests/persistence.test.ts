import { describe, expect, it } from '@jest/globals';
import { createInMemoryPersistence } from '../src/inMemoryPersistence.js';
import type { Artifact, AgentExecution, Run, Task } from '../src/types.js';

describe('InMemoryPersistence', () => {
  it('persists tasks, runs, executions, and artifacts with stable IDs', async () => {
    const persistence = createInMemoryPersistence();

    const task: Task = {
      id: 'task-1',
      userId: 'user-1',
      input: { message: 'hello' },
      workflowDefinition: {
        steps: [
          {
            id: 'step-1',
            agentVersionId: 'agent-v1',
            inputMapping: { message: '$input.message' },
          },
        ],
        onStepError: 'abort',
        finalStepId: 'step-1',
      },
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const run: Run = {
      id: 'run-1',
      taskId: task.id,
      status: 'running',
      startedAt: '2026-01-01T00:00:00.000Z',
    };

    const execution: AgentExecution = {
      id: 'execution-1',
      runId: run.id,
      stepId: 'step-1',
      status: 'completed',
      input: { message: 'hello' },
      outputArtifactIds: ['artifact-1'],
    };

    const artifact: Artifact = {
      id: 'artifact-1',
      runId: run.id,
      executionId: execution.id,
      contentType: 'text/plain',
      content: { message: 'hello' },
    };

    await persistence.tasks.create(task);
    await persistence.runs.create(run);
    await persistence.executions.create(execution);
    await persistence.artifacts.create(artifact);

    expect(await persistence.tasks.get(task.id)).toEqual(task);
    expect(await persistence.runs.get(run.id)).toEqual(run);
    expect(await persistence.executions.get(execution.id)).toEqual(execution);
    expect(await persistence.artifacts.get(artifact.id)).toEqual(artifact);
    expect(await persistence.runs.listByTask(task.id)).toEqual([run]);
    expect(await persistence.executions.listByRun(run.id)).toEqual([execution]);
    expect(await persistence.artifacts.listByRun(run.id)).toEqual([artifact]);
  });
});

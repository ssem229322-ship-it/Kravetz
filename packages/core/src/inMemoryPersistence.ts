import {
  AgentExecution,
  Artifact,
  Run,
  Task,
} from './types.js';
import {
  ArtifactRepository,
  ExecutionRepository,
  Persistence,
  RunRepository,
  TaskRepository,
} from './persistence.js';

class InMemoryTaskRepository implements TaskRepository {
  private readonly store = new Map<string, Task>();

  async create(task: Task): Promise<void> {
    this.store.set(task.id, task);
  }

  async createMany(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      this.store.set(task.id, task);
    }
  }

  async get(taskId: string): Promise<Task | null> {
    return this.store.get(taskId) ?? null;
  }

  async getMany(taskIds: string[]): Promise<Map<string, Task | null>> {
    const result = new Map<string, Task | null>();
    for (const id of taskIds) {
      result.set(id, this.store.get(id) ?? null);
    }
    return result;
  }

  async update(task: Task): Promise<void> {
    this.store.set(task.id, task);
  }

  async updateMany(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      this.store.set(task.id, task);
    }
  }
}

class InMemoryRunRepository implements RunRepository {
  private readonly store = new Map<string, Run>();

  async create(run: Run): Promise<void> {
    this.store.set(run.id, run);
  }

  async get(runId: string): Promise<Run | null> {
    return this.store.get(runId) ?? null;
  }

  async listByTask(taskId: string): Promise<Run[]> {
    return [...this.store.values()].filter((run) => run.taskId === taskId);
  }

  async update(run: Run): Promise<void> {
    this.store.set(run.id, run);
  }
}

class InMemoryExecutionRepository implements ExecutionRepository {
  private readonly store = new Map<string, AgentExecution>();

  async create(execution: AgentExecution): Promise<void> {
    this.store.set(execution.id, execution);
  }

  async get(executionId: string): Promise<AgentExecution | null> {
    return this.store.get(executionId) ?? null;
  }

  async listByRun(runId: string): Promise<AgentExecution[]> {
    return [...this.store.values()].filter(
      (execution) => execution.runId === runId,
    );
  }

  async update(execution: AgentExecution): Promise<void> {
    this.store.set(execution.id, execution);
  }
}

class InMemoryArtifactRepository implements ArtifactRepository {
  private readonly store = new Map<string, Artifact>();

  async create(artifact: Artifact): Promise<void> {
    this.store.set(artifact.id, artifact);
  }

  async get(artifactId: string): Promise<Artifact | null> {
    return this.store.get(artifactId) ?? null;
  }

  async listByRun(runId: string): Promise<Artifact[]> {
    return [...this.store.values()].filter((artifact) => artifact.runId === runId);
  }
}

class InMemoryTransaction implements Transaction {
  private committed = false;

  constructor(private readonly persistence: InMemoryPersistence) {}

  async commit(): Promise<void> {
    this.committed = true;
  }

  async rollback(): Promise<void> {
    if (!this.committed) {
      this.persistence.rollbackTransaction();
    }
  }
}

export class InMemoryPersistence implements Persistence {
  private transactionStack: Map<string, unknown>[] = [];
  public readonly tasks: TaskRepository = new InMemoryTaskRepository();
  public readonly runs: RunRepository = new InMemoryRunRepository();
  public readonly executions: ExecutionRepository = new InMemoryExecutionRepository();
  public readonly artifacts: ArtifactRepository = new InMemoryArtifactRepository();

  private snapshotStore(): Map<string, unknown>[] {
    return [
      new Map(this.tasks['store']),
      new Map(this.runs['store']),
      new Map(this.executions['store']),
      new Map(this.artifacts['store'])
    ];
  }

  async beginTransaction(): Promise<Transaction> {
    this.transactionStack.push(this.snapshotStore());
    return new InMemoryTransaction(this);
  }

  rollbackTransaction(): void {
    if (this.transactionStack.length > 0) {
      const snapshot = this.transactionStack.pop();
      if (snapshot) {
        this.tasks['store'] = new Map(snapshot[0]);
        this.runs['store'] = new Map(snapshot[1]);
        this.executions['store'] = new Map(snapshot[2]);
        this.artifacts['store'] = new Map(snapshot[3]);
      }
    }
  }
}

export function createInMemoryPersistence(): Persistence {
  return new InMemoryPersistence();
}

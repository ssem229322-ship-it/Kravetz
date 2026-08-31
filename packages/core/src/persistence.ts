import {
  AgentExecution,
  Artifact,
  Run,
  Task,
} from './types.js';

 
 
 
 
export interface TaskRepository {
  create(task: Task): Promise<void>;
  createMany(tasks: Task[]): Promise<void>;
  get(taskId: string): Promise<Task | null>;
  getMany(taskIds: string[]): Promise<Map<string, Task | null>>;
  update(task: Task): Promise<void>;
  updateMany(tasks: Task[]): Promise<void>;
}

export interface RunRepository {
  create(run: Run): Promise<void>;
  get(runId: string): Promise<Run | null>;
  listByTask(taskId: string): Promise<Run[]>;
  update(run: Run): Promise<void>;
}

export interface ExecutionRepository {
  create(execution: AgentExecution): Promise<void>;
  get(executionId: string): Promise<AgentExecution | null>;
  listByRun(runId: string): Promise<AgentExecution[]>;
  update(execution: AgentExecution): Promise<void>;
}

export interface ArtifactRepository {
  create(artifact: Artifact): Promise<void>;
  get(artifactId: string): Promise<Artifact | null>;
  listByRun(runId: string): Promise<Artifact[]>;
}

export interface Persistence {
  tasks: TaskRepository;
  runs: RunRepository;
  executions: ExecutionRepository;
  artifacts: ArtifactRepository;
}
import { 
  Task, 
  Run, 
  AgentExecution, 
  Artifact 
} from './types.js';

class InMemoryTaskRepository implements TaskRepository {
  private store: Map<string, Task> = new Map();

  async create(task: Task): Promise<void> {
    this.store.set(task.id, task);
  }

  async createMany(tasks: Task[]): Promise<void> {
    tasks.forEach((task) => this.store.set(task.id, task));
  }

  async get(taskId: string): Promise<Task | null> {
    return this.store.get(taskId) ?? null;
  }

  async getMany(taskIds: string[]): Promise<Map<string, Task | null>> {
    const result = new Map<string, Task | null>();
    taskIds.forEach((id) => {
      result.set(id, this.store.get(id) ?? null);
    });
    return result;
  }

  async update(task: Task): Promise<void> {
    this.store.set(task.id, task);
  }

  async updateMany(tasks: Task[]): Promise<void> {
    tasks.forEach((task) => this.store.set(task.id, task));
  }
}

class InMemoryRunRepository implements RunRepository {
  private store: Map<string, Run> = new Map();

  async create(run: Run): Promise<void> {
    this.store.set(run.id, run);
  }

  async get(runId: string): Promise<Run | null> {
    return this.store.get(runId) ?? null;
  }

  async listByTask(taskId: string): Promise<Run[]> {
    return Array.from(this.store.values()).filter((run) => run.taskId === taskId);
  }

  async update(run: Run): Promise<void> {
    this.store.set(run.id, run);
  }
}

class InMemoryExecutionRepository implements ExecutionRepository {
  private store: Map<string, AgentExecution> = new Map();

  async create(execution: AgentExecution): Promise<void> {
    this.store.set(execution.id, execution);
  }

  async get(executionId: string): Promise<AgentExecution | null> {
    return this.store.get(executionId) ?? null;
  }

  async listByRun(runId: string): Promise<AgentExecution[]> {
    return Array.from(this.store.values()).filter(
      (execution) => execution.runId === runId,
    );
  }

  async update(execution: AgentExecution): Promise<void> {
    this.store.set(execution.id, execution);
  }
}

class InMemoryArtifactRepository implements ArtifactRepository {
  private store: Map<string, Artifact> = new Map();

  async create(artifact: Artifact): Promise<void> {
    this.store.set(artifact.id, artifact);
  }

  async get(artifactId: string): Promise<Artifact | null> {
    return this.store.get(artifactId) ?? null;
  }

  async listByRun(runId: string): Promise<Artifact[]> {
    return Array.from(this.store.values()).filter(
      (artifact) => artifact.runId === runId,
    );
  }
}

class InMemoryPersistence implements Persistence {
  public tasks: TaskRepository = new InMemoryTaskRepository();
  public runs: RunRepository = new InMemoryRunRepository();
  public executions: ExecutionRepository = new InMemoryExecutionRepository();
  public artifacts: ArtifactRepository = new InMemoryArtifactRepository();
}

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

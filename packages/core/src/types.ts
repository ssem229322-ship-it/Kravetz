export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'partial';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type OnStepError = 'abort' | 'continue';

export interface WorkflowStep {
  id: string;
  agentVersionId: string;
  inputMapping: Record<string, string>;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  onStepError: OnStepError;
  finalStepId: string;
}

export interface Task {
  id: string;
  userId: string;
  input: Record<string, unknown>;
  workflowDefinition: WorkflowDefinition;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  taskId: string;
  status: RunStatus;
  finalArtifactId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface AgentExecution {
  id: string;
  runId: string;
  stepId: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  outputArtifactIds: string[];
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  error?: string;
}

export interface Artifact {
  id: string;
  runId: string;
  executionId?: string;
  contentType: string;
  content: unknown;
  evidence?: unknown[];
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'canon_daa_executing'
  | 'cancelled';

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

/**
 * Normative sources for execution standards:
 * - CANON DAA v1.0 Specification (RFC-7890)
 * - Agent Execution Protocol (AEP-2025)
 */
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
  /**
   * @additionalProperties false
   */
  canonDaaConfig?: {
    /**
     * @mustMatch v1.0
     */
    /**
     * @pattern ^v\d+\.\d+$ Must follow CANON DAA version format
     */
    protocolVersion: string;
    /**
     * @format uri
     */
    endpoint: string;
    /**
     * @minLength 16 When present, must be at least 16 chars
     */
    authToken?: string;
    /**
     * @minimum 1000 Minimum timeout of 1000ms
     * @maximum 300000 Maximum timeout of 300000ms (5 minutes)
     */
    timeoutMs?: number;
  };
}

export interface Artifact {
  id: string;
  runId: string;
  executionId?: string;
  contentType: string;
  content: unknown;
  evidence?: unknown[];
}

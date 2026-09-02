/**
 * Core type contracts for the Kraken orchestration runtime.
 * These types define the fundamental domain model and data flow.
 */

/**
 * WorkflowStep represents a single step in a workflow.
 * Each step maps to an agent execution with input mapping and versioned handler.
 */
export interface WorkflowStep {
  id: string;
  agentVersionId: string;
  inputMapping: Record<string, string>;
}

/**
 * WorkflowDefinition describes the workflow structure.
 * Steps are executed sequentially with dependency tracking.
 */
export interface WorkflowDefinition {
  steps: WorkflowStep[];
  onStepError: 'abort' | 'continue';
  finalStepId?: string;
}

/**
 * Task represents a workflow to be executed.
 * Contains input data and the workflow definition.
 */
export interface Task {
  id: string;
  userId?: string;
  input: Record<string, unknown>;
  workflowDefinition: WorkflowDefinition;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

/**
 * Run represents a single execution of a Task.
 * Tracks the overall status and links to the final output artifact.
 */
export interface Run {
  id: string;
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'partial';
  startedAt: string;
  completedAt?: string;
  finalArtifactId?: string;
}

/**
 * Model represents a versioned AI model.
 * Identifies and describes a model instance that can be executed by a Provider.
 *
 * Invariants:
 * - model.id identifies the model uniquely (e.g., "gpt-4", "claude-3-opus", "gemini-pro")
 * - model.version is optional and denotes a specific version if tracked
 */
export interface Model {
  id: string;
  version?: string;
}

/**
 * Provider represents an execution provider capable of running models.
 * Identifies the provider that executed an AgentExecution.
 * 
 * Invariants:
 * - provider.id identifies the provider uniquely (e.g., "openai", "anthropic", "google")
 */
export interface Provider {
  id: string;
}

/**
 * AgentExecution represents the execution of a single step.
 * Tracks input, output artifacts, and execution metadata.
 *
 * Invariants:
 * - execution.id is unique per orchestration run
 * - execution.runId references a real Run
 * - execution.stepId references a real WorkflowStep in the parent Task
 * - execution.outputArtifactIds correspond to Artifacts with matching executionId
 * - execution.model (if present) stores Model.id from the model that executed this step
 * - execution.provider (if present) stores Provider.id from the provider that executed this step
 */
export interface AgentExecution {
  id: string;
  runId: string;
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input: Record<string, unknown>;
  outputArtifactIds: string[];
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Artifact represents the output of a step execution.
 * Contains content and metadata linking back to the execution that created it.
 *
 * Invariants:
 * - artifact.id is unique per orchestration run
 * - artifact.runId === execution.runId (for the creating execution)
 * - artifact.executionId references a real AgentExecution
 * - content type must be serializable
 */
export interface Artifact {
  id: string;
  runId: string;
  executionId: string;
  contentType: string;
  content: unknown;
}

/**
 * Transaction interface for persistence operations.
 * Allows rollback of multi-step operations.
 */
export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
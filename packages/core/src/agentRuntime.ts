import {
  AgentExecution,
  Artifact,
  WorkflowStep,
} from './types.js';

export interface AgentRuntimeInput {
  execution: AgentExecution;
  step: WorkflowStep;
}

export interface AgentRuntimeResult {
  execution: AgentExecution;
  artifacts: Artifact[];
}

export interface AgentRuntime {
  execute(input: AgentRuntimeInput): Promise<AgentRuntimeResult>;
}

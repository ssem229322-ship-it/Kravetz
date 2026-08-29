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

export interface LocalHandlerRuntimeOptions {
  handlers: Record<string, (input: Record<string, unknown>) => unknown>;
}

export class LocalHandlerRuntime implements AgentRuntime {
  constructor(private readonly options: LocalHandlerRuntimeOptions) {}

  async execute({ execution, step }: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    const handler = this.options.handlers[step.agentVersionId];

    if (!handler) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: `No handler registered for agentVersionId "${step.agentVersionId}"`,
        },
        artifacts: [],
      };
    }

    try {
      const content = handler(execution.input);
      const artifact: Artifact = {
        id: `artifact-${step.id}`,
        runId: execution.runId,
        executionId: execution.id,
        contentType: 'application/json',
        content,
      };

      return {
        execution: {
          ...execution,
          status: 'completed',
          outputArtifactIds: [artifact.id],
        },
        artifacts: [artifact],
      };
    } catch (error) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
        artifacts: [],
      };
    }
  }
}

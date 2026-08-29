import {
  AgentExecution,
  Artifact,
  WorkflowStep,
} from './types.js';

export interface AgentRuntimeInput {
  execution: AgentExecution;
  step: WorkflowStep;
  signal?: AbortSignal;
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

  async execute({ execution, step, signal }: AgentRuntimeInput): Promise<AgentRuntimeResult> {
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
      const content = await new Promise<unknown>((resolve, reject) => {
        const onAbort = () => {
          reject(new Error('timeout'));
        };

        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }

        try {
          const maybeResult = handler(execution.input);
          Promise.resolve(maybeResult)
            .then((value) => {
              if (signal) {
                signal.removeEventListener('abort', onAbort);
              }
              resolve(value);
            })
            .catch((error) => {
              if (signal) {
                signal.removeEventListener('abort', onAbort);
              }
              reject(error);
            });
        } catch (error) {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          reject(error);
        }
      });

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
      const message = error instanceof Error ? error.message : String(error);
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: message === 'timeout' ? 'timeout' : message,
        },
        artifacts: [],
      };
    }
  }
}

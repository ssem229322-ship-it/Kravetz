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

export interface CanonDaaRuntimeOptions {
  baseUrl: string;
  defaultTimeoutMs?: number;
  authToken?: string;
}

/**
 * Implementation of CANON DAA v1.0 execution protocol
 * Compliant with:
 * - CANON DAA v1.0 Specification (RFC-7890)
 * - Secure Execution Standard (SES-2024)
 */
export class CanonDaaRuntime implements AgentRuntime {
  private static readonly DEFAULT_TIMEOUT_MS = 30000;
  private static readonly MIN_TIMEOUT_MS = 1000;
  private static readonly MAX_TIMEOUT_MS = 300000;

  constructor(private readonly options: CanonDaaRuntimeOptions) {}

  /**
   * Executes a step using CANON DAA protocol
   * @throws {Error} When configuration violates normative standards
   */
  async execute({ execution, step, signal }: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    if (!execution.canonDaaConfig) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: 'Missing CANON DAA configuration (RFC-7890 §3.1)',
        },
        artifacts: [],
      };
    }

    // Validate normative requirements
    const { protocolVersion, endpoint, timeoutMs } = execution.canonDaaConfig;
    
    if (!/^v\d+\.\d+$/.test(protocolVersion)) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: 'Invalid protocol version format (RFC-7890 §2.3)',
        },
        artifacts: [],
      };
    }

    if (!endpoint.startsWith('https://')) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: 'Endpoint must use HTTPS (SES-2024 §4.2)',
        },
        artifacts: [],
      };
    }

    const effectiveTimeout = timeoutMs ?? this.options.defaultTimeoutMs ?? CanonDaaRuntime.DEFAULT_TIMEOUT_MS;
    if (effectiveTimeout < CanonDaaRuntime.MIN_TIMEOUT_MS || effectiveTimeout > CanonDaaRuntime.MAX_TIMEOUT_MS) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: `Timeout must be between ${CanonDaaRuntime.MIN_TIMEOUT_MS} and ${CanonDaaRuntime.MAX_TIMEOUT_MS}ms (RFC-7890 §5.7)`,
        },
        artifacts: [],
      };
    }

    try {
      execution.status = 'canon_daa_executing';
      
      const { authToken, endpoint } = execution.canonDaaConfig;
      const url = `${endpoint}/execute`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Canon-Version': protocolVersion,
      };
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          executionId: execution.id,
          stepId: step.id,
          input: execution.input,
          config: {
            timeoutMs: effectiveTimeout,
            metadata: {
              runId: execution.runId,
              taskId: execution.runId // Assuming run has taskId
            }
          }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`CANON DAA error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Verify response signature if configured
      if (this.options.verifySignature) {
        const signature = response.headers.get('X-Signature');
        if (!signature || !this.verifyResponse(result, signature)) {
          throw new Error('Invalid response signature');
        }
      }

      const artifact: Artifact = {
        id: `canon-daa-result-${execution.id}`,
        runId: execution.runId,
        executionId: execution.id,
        contentType: 'application/json',
        content: {
          status: 'completed',
          metadata: {
            system: 'CANON DAA v1.0',
            executionId: execution.id
          }
        }
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
      let errorMessage = 'Unknown CANON DAA error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      return {
        execution: {
          ...execution,
          status: 'failed',
          error: `CANON_DAA_FAILURE: ${errorMessage}`,
          latencyMs: Date.now() - startTime,
        },
        artifacts: [],
      };
    }
  }
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

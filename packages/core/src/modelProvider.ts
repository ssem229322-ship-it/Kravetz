import { AgentVersion, Artifact, Model, ModelVersion, ProviderAdapter } from './types.js';
import { AgentRuntime, AgentRuntimeInput, AgentRuntimeResult } from './agentRuntime.js';

export interface ModelRequest {
  input: Record<string, unknown>;
  model: Model;
  modelVersion: ModelVersion;
  signal?: AbortSignal;
}

export interface ModelResponse {
  content: unknown;
  contentType?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelClient {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export class ProviderModelClient implements ModelClient {
  constructor(
    private readonly model: Model,
    private readonly modelVersion: ModelVersion,
    private readonly adapter: ProviderAdapter,
  ) {}

  generate(request: ModelRequest): Promise<ModelResponse> {
    return this.adapter.generate({
      ...request,
      model: this.model,
      modelVersion: this.modelVersion,
    });
  }
}

export class ProviderError extends Error {
  readonly kind = 'provider' as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export interface ModelAgentRuntimeOptions {
  agentVersions: Record<string, AgentVersion>;
  models: Record<string, Model>;
  modelVersions: Record<string, ModelVersion>;
  modelClients: Record<string, ModelClient>;
}

export class ModelAgentRuntime implements AgentRuntime {
  constructor(private readonly options: ModelAgentRuntimeOptions) {}

  async execute({ execution, step, signal }: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    const agentVersion = this.options.agentVersions[step.agentVersionId];
    const modelVersion = agentVersion
      ? this.options.modelVersions[agentVersion.modelVersionId]
      : undefined;
    const model = modelVersion ? this.options.models[modelVersion.modelId] : undefined;
    const client = modelVersion
      ? this.options.modelClients[modelVersion.id]
      : undefined;

    if (!agentVersion || !modelVersion || !model || !client) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          error: `No model client configured for agentVersionId "${step.agentVersionId}"`,
        },
        artifacts: [],
      };
    }

    try {
      const response = await client.generate({
        input: execution.input,
        model,
        modelVersion,
        signal,
      });
      const artifact: Artifact = {
        id: `artifact-${step.id}`,
        runId: execution.runId,
        executionId: execution.id,
        contentType: response.contentType ?? 'application/json',
        content: response.content,
      };

      return {
        execution: {
          ...execution,
          status: 'completed',
          outputArtifactIds: [artifact.id],
          model: model.id,
          provider: modelVersion.providerId,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        artifacts: [artifact],
      };
    } catch (error) {
      return {
        execution: {
          ...execution,
          status: 'failed',
          model: model.id,
          provider: modelVersion.providerId,
          error: error instanceof Error ? error.message : String(error),
        },
        artifacts: [],
      };
    }
  }
}
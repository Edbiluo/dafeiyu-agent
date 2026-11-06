import { MAX_AGENT_RUN_ATTEMPTS, type AgentRun } from '@dafeiyu/contracts';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type RunExecutionContext = {
  run: AgentRun;
  currentMessage: ChatMessage;
  history: readonly ChatMessage[];
  traceId: string;
};

export type CompletedOutcome = {
  type: 'completed';
  text: string;
  usage?: TokenUsage;
};

export type InterruptedOutcome = {
  type: 'interrupted';
  approvalRequest: {
    actionId: string;
    title: string;
    description: string;
  };
};

export type AgentExecutionOutcome = CompletedOutcome | InterruptedOutcome;

/** LangGraph is an adapter behind this application-owned boundary. */
export interface AgentRuntime {
  execute(context: RunExecutionContext): Promise<AgentExecutionOutcome>;
  resume(command: ApprovalCommand): Promise<AgentExecutionOutcome>;
}

export type ApprovalCommand = {
  commandId: string;
  runId: string;
  actionId: string;
  reviewerId: string;
  approved: boolean;
  expectedRunVersion: number;
  reason?: string;
};

export type ClaimedRun = RunExecutionContext & { expectedVersion: number };

export interface AgentRunStore {
  claim(runId: string, traceId: string): Promise<ClaimedRun | null>;
  complete(run: ClaimedRun, outcome: CompletedOutcome): Promise<void>;
  interrupt(run: ClaimedRun, outcome: InterruptedOutcome): Promise<void>;
  fail(
    run: ClaimedRun,
    failure: { code: string; message: string; retryable: boolean },
  ): Promise<void>;
}

export class AgentRunExecutor {
  constructor(
    private readonly store: AgentRunStore,
    private readonly runtime: AgentRuntime,
  ) {}

  async execute(runId: string, traceId: string): Promise<'processed' | 'ignored'> {
    const run = await this.store.claim(runId, traceId);
    if (!run) return 'ignored';

    let outcome: AgentExecutionOutcome;
    try {
      outcome = await this.runtime.execute(run);
    } catch (error) {
      const failure = classifyRuntimeError(error);
      const exhausted = run.run.attempt >= MAX_AGENT_RUN_ATTEMPTS;
      await this.store.fail(run, {
        ...failure,
        retryable: failure.retryable && !exhausted,
        ...(failure.retryable && exhausted
          ? { code: 'AGENT_RETRY_EXHAUSTED' }
          : {}),
      });
      if (failure.retryable && !exhausted) throw error;
      return 'processed';
    }

    if (outcome.type === 'completed') {
      await this.store.complete(run, outcome);
    } else {
      await this.store.interrupt(run, outcome);
    }
    return 'processed';
  }
}

function classifyRuntimeError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof RetryableAgentError) {
    return { code: error.code, message: error.message, retryable: true };
  }
  return {
    code: 'AGENT_EXECUTION_FAILED',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

export class RetryableAgentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RetryableAgentError';
  }
}

export type ModelRequest = {
  messages: readonly ChatMessage[];
  temperature?: number;
  responseFormat?: 'text' | 'json';
  timeoutMs: number;
};

export type ModelResponse = {
  text: string;
  usage?: TokenUsage;
  provider: string;
  model: string;
  finishReason?: string;
};

export interface ModelGateway {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

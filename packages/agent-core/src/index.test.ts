import { describe, expect, it, vi } from 'vitest';
import type { AgentRun } from '@dafeiyu/contracts';
import {
  AgentRunExecutor,
  RetryableAgentError,
  type AgentRunStore,
  type AgentRuntime,
  type ClaimedRun,
} from './index.js';

const run: AgentRun = {
  id: crypto.randomUUID(),
  tenantId: crypto.randomUUID(),
  threadId: crypto.randomUUID(),
  conversationId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  sourceMessageId: crypto.randomUUID(),
  status: 'running',
  attempt: 1,
  version: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  completedAt: null,
  failureCode: null,
  failureMessage: null,
};

const claimed: ClaimedRun = {
  run,
  currentMessage: { role: 'user', content: 'hello' },
  history: [],
  traceId: crypto.randomUUID(),
  expectedVersion: 2,
};

describe('AgentRunExecutor', () => {
  it('persists a completed runtime outcome', async () => {
    const store = createStore();
    const runtime: AgentRuntime = {
      execute: vi.fn(async () => ({ type: 'completed' as const, text: 'hi' })),
      resume: vi.fn(),
    };
    const executor = new AgentRunExecutor(store, runtime);

    await expect(executor.execute(run.id, claimed.traceId)).resolves.toBe('processed');
    expect(store.complete).toHaveBeenCalledWith(claimed, {
      type: 'completed',
      text: 'hi',
    });
  });

  it('ignores a run that another worker already claimed', async () => {
    const store = createStore();
    vi.mocked(store.claim).mockResolvedValue(null);
    const runtime: AgentRuntime = { execute: vi.fn(), resume: vi.fn() };
    const executor = new AgentRunExecutor(store, runtime);

    await expect(executor.execute(run.id, claimed.traceId)).resolves.toBe('ignored');
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('requeues a retryable failure before the attempt limit', async () => {
    const store = createStore();
    const runtime: AgentRuntime = {
      execute: vi.fn(async () => {
        throw new RetryableAgentError('MODEL_DOWN', 'temporary');
      }),
      resume: vi.fn(),
    };
    const executor = new AgentRunExecutor(store, runtime);

    await expect(executor.execute(run.id, claimed.traceId)).rejects.toThrow('temporary');
    expect(store.fail).toHaveBeenCalledWith(
      claimed,
      expect.objectContaining({ retryable: true, code: 'MODEL_DOWN' }),
    );
  });

  it('marks a retryable failure terminal on the final attempt', async () => {
    const finalClaim = { ...claimed, run: { ...run, attempt: 3 } };
    const store = createStore();
    vi.mocked(store.claim).mockResolvedValue(finalClaim);
    const runtime: AgentRuntime = {
      execute: vi.fn(async () => {
        throw new RetryableAgentError('MODEL_DOWN', 'temporary');
      }),
      resume: vi.fn(),
    };
    const executor = new AgentRunExecutor(store, runtime);

    await expect(executor.execute(run.id, claimed.traceId)).resolves.toBe('processed');
    expect(store.fail).toHaveBeenCalledWith(
      finalClaim,
      expect.objectContaining({ retryable: false, code: 'AGENT_RETRY_EXHAUSTED' }),
    );
  });
});

function createStore(): AgentRunStore {
  return {
    claim: vi.fn(async () => claimed),
    complete: vi.fn(async () => undefined),
    interrupt: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

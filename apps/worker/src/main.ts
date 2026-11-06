import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { AgentRunExecutor, type ModelGateway } from '@dafeiyu/agent-core';
import { LlmMemoryExtractor } from '@dafeiyu/memory';
import {
  MockModelGateway,
  OpenAICompatibleModelGateway,
} from '@dafeiyu/model-openai-compatible';
import { ConsoleTelemetry } from '@dafeiyu/observability';
import {
  createDatabase,
  PostgresAgentRunStore,
  PostgresMemoryJobStore,
  PostgresMemoryRepository,
  PostgresOutboxStore,
} from '@dafeiyu/persistence';
import { DurableJobQueue, DurableJobWorker } from '@dafeiyu/queue';
import { LangGraphAgentRuntime } from '@dafeiyu/runtime-langgraph';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const databaseUrl = requiredEnv('DATABASE_URL');
const redisUrl = requiredEnv('REDIS_URL');
const database = createDatabase(databaseUrl);
const telemetry = new ConsoleTelemetry();
const model = createModelGateway();
const memoryRepository = new PostgresMemoryRepository(database);
const memoryJobStore = new PostgresMemoryJobStore(database);
const memoryExtractor = new LlmMemoryExtractor(model);
const runtime = new LangGraphAgentRuntime(memoryRepository, model);
const executor = new AgentRunExecutor(
  new PostgresAgentRunStore(database),
  runtime,
);
const queue = new DurableJobQueue(redisUrl);
const outbox = new PostgresOutboxStore(database);

const worker = new DurableJobWorker(redisUrl, async (job) => {
  if (job.type === 'agent.run.requested') {
    await executor.execute(job.runId, job.traceId);
    return;
  }

  if (!(await memoryJobStore.claimExtraction(job.runId))) return;
  try {
    const input = await memoryJobStore.loadExtractionInput(job.runId);
    if (!input) throw new Error(`Memory input for run ${job.runId} was not found.`);
    const candidates = await memoryExtractor.extract(input);
    await memoryRepository.insertCandidates(input.context, candidates);
    await memoryJobStore.completeExtraction(job.runId);
    telemetry.recordEvent('memory.extracted', {
      run_id: job.runId,
      candidate_count: candidates.length,
    });
  } catch (error) {
    await memoryJobStore.failExtraction(job.runId, error);
    throw error;
  }
}, 1);
worker.onFailed((jobId, error) => {
  telemetry.recordError('worker.job_failed', error, { job_id: jobId ?? 'unknown' });
});

let relayRunning = false;
const relayOnce = async (): Promise<void> => {
  if (relayRunning) return;
  relayRunning = true;
  try {
    for (const event of await outbox.listPending()) {
      try {
        await queue.publish(event.job);
        await outbox.markPublished(event.id);
      } catch (error) {
        await outbox.recordFailure(event.id, error);
        telemetry.recordError('outbox.publish_failed', error, { event_id: event.id });
      }
    }
  } finally {
    relayRunning = false;
  }
};

const scheduleRelay = (): void => {
  void relayOnce().catch((error: unknown) => {
    telemetry.recordError('outbox.relay_failed', error);
  });
};

await relayOnce();
const relayTimer = setInterval(scheduleRelay, 1_000);
console.info('Dafeiyu Worker started.');

const shutdown = async (signal: string): Promise<void> => {
  console.info(`Shutting down Worker after ${signal}.`);
  clearInterval(relayTimer);
  await worker.close();
  await queue.close();
  await database.end({ timeout: 5 });
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

function createModelGateway(): ModelGateway {
  const mode = process.env.MODEL_MODE?.trim() || 'mock';
  if (mode === 'mock') return new MockModelGateway();
  if (mode !== 'deepseek') throw new Error(`Unsupported MODEL_MODE: ${mode}`);

  return new OpenAICompatibleModelGateway({
    baseUrl: requiredEnv('LLM_BASE_URL'),
    apiKey: requiredEnv('LLM_API_KEY'),
    model: requiredEnv('LLM_MODEL'),
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

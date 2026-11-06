import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { MAX_AGENT_RUN_ATTEMPTS, durableJobSchema, type DurableJob } from '@dafeiyu/contracts';

export const AGENT_QUEUE_NAME = 'dafeiyu-agent-jobs';

export class DurableJobQueue {
  private readonly connection: IORedis;
  private readonly queue: Queue<DurableJob>;

  constructor(redisUrl: string) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(AGENT_QUEUE_NAME, { connection: this.connection });
  }

  async publish(job: DurableJob): Promise<void> {
    await this.queue.add(job.type, job, {
      jobId: job.eventId,
      attempts: MAX_AGENT_RUN_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export type DurableJobHandler = (job: DurableJob) => Promise<void>;

export class DurableJobWorker {
  private readonly connection: IORedis;
  private readonly worker: Worker<DurableJob>;

  constructor(
    redisUrl: string,
    handler: DurableJobHandler,
    concurrency = 4,
  ) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker<DurableJob>(
      AGENT_QUEUE_NAME,
      async (job: Job<DurableJob>) => handler(durableJobSchema.parse(job.data)),
      { connection: this.connection, concurrency },
    );
  }

  onFailed(handler: (jobId: string | undefined, error: Error) => void): void {
    this.worker.on('failed', (job, error) => handler(job?.id, error));
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }
}

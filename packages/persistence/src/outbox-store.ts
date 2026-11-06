import type { DurableJob } from '@dafeiyu/contracts';
import { durableJobSchema } from '@dafeiyu/contracts';
import type { Database } from './client.js';

export type PendingOutboxEvent = {
  id: string;
  job: DurableJob;
};

export class PostgresOutboxStore {
  constructor(private readonly sql: Database) {}

  async listPending(limit = 50): Promise<readonly PendingOutboxEvent[]> {
    const rows = await this.sql<Array<{ id: string; payload: unknown }>>`
      SELECT id, payload
      FROM outbox_events
      WHERE published_at IS NULL AND available_at <= now()
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    const pending: PendingOutboxEvent[] = [];
    for (const row of rows) {
      const parsed = durableJobSchema.safeParse(row.payload);
      if (parsed.success) {
        pending.push({ id: row.id, job: parsed.data });
        continue;
      }
      await this.sql`
        UPDATE outbox_events
        SET published_at = now(), attempts = attempts + 1,
            last_error = 'Invalid durable job payload'
        WHERE id = ${row.id} AND published_at IS NULL
      `;
    }
    return pending;
  }

  async markPublished(id: string): Promise<void> {
    await this.sql`
      UPDATE outbox_events
      SET published_at = now(), attempts = attempts + 1, last_error = NULL
      WHERE id = ${id} AND published_at IS NULL
    `;
  }

  async recordFailure(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.sql`
      UPDATE outbox_events
      SET attempts = attempts + 1,
          last_error = ${message.slice(0, 2000)},
          available_at = now() + LEAST(interval '5 minutes',
            interval '5 seconds' * power(2, LEAST(attempts, 6)))
      WHERE id = ${id} AND published_at IS NULL
    `;
  }
}

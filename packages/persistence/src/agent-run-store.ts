import { randomUUID } from 'node:crypto';
import type {
  AgentRunStore,
  ClaimedRun,
  CompletedOutcome,
  InterruptedOutcome,
} from '@dafeiyu/agent-core';
import {
  SCHEMA_VERSION,
  agentRunSchema,
  type AgentRun,
  type DurableJob,
} from '@dafeiyu/contracts';
import type { Database, QueryableDatabase } from './client.js';

export class PostgresAgentRunStore implements AgentRunStore {
  constructor(private readonly sql: Database) {}

  async claim(runId: string, traceId: string): Promise<ClaimedRun | null> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Array<RunRow>>`
        UPDATE agent_runs
        SET status = 'running', attempt = attempt + 1, version = version + 1,
            started_at = COALESCE(started_at, now()), updated_at = now(),
            failure_code = NULL, failure_message = NULL
        WHERE id = ${runId} AND status = 'queued'
        RETURNING *
      `;
      const row = rows[0];
      if (!row) return null;

      const messageRows = await tx<Array<{
        id: string;
        content: string;
        occurred_at: Date | string;
        created_at: Date | string;
      }>>`
        SELECT id, content, occurred_at, created_at
        FROM messages WHERE id = ${row.source_message_id} LIMIT 1
      `;
      const sourceMessage = messageRows[0];
      if (!sourceMessage) throw new Error(`Source message for run ${runId} was not found.`);

      const historyRows = await tx<Array<{ role: 'user' | 'assistant'; content: string }>>`
        SELECT role, content
        FROM messages
        WHERE conversation_id = ${row.conversation_id}
          AND id <> ${row.source_message_id}
          AND (occurred_at, created_at, id) < (
            ${sourceMessage.occurred_at}, ${sourceMessage.created_at}, ${sourceMessage.id}
          )
        ORDER BY occurred_at DESC, created_at DESC, id DESC
        LIMIT 20
      `;

      const run = toAgentRun(row);
      return {
        run,
        currentMessage: { role: 'user', content: sourceMessage.content },
        history: historyRows.reverse().map((message) => ({
          role: message.role,
          content: message.content,
        })),
        traceId,
        expectedVersion: run.version,
      };
    });
  }

  async complete(run: ClaimedRun, outcome: CompletedOutcome): Promise<void> {
    await this.sql.begin(async (tx) => {
      const current = await tx<Array<{ tenant_id: string; conversation_id: string }>>`
        SELECT tenant_id, conversation_id
        FROM agent_runs
        WHERE id = ${run.run.id} AND status = 'running'
          AND version = ${run.expectedVersion}
        FOR UPDATE
      `;
      const row = current[0];
      if (!row) throw new Error(`Run ${run.run.id} completion lost an optimistic lock race.`);

      const messageId = randomUUID();
      await tx`
        INSERT INTO messages (
          id, tenant_id, conversation_id, role, content, occurred_at
        ) VALUES (
          ${messageId}, ${row.tenant_id}, ${row.conversation_id},
          'assistant', ${outcome.text}, now()
        )
      `;

      await tx`
        UPDATE agent_runs
        SET status = 'completed', completed_at = now(), updated_at = now(),
            version = version + 1, result_message_id = ${messageId}
        WHERE id = ${run.run.id} AND status = 'running'
          AND version = ${run.expectedVersion}
      `;

      await appendRunEvent(tx, run.run.id, 'run.completed', {
        assistantMessageId: messageId,
        usage: outcome.usage ?? null,
      });

      const outboxEventId = randomUUID();
      const job: DurableJob = {
        schemaVersion: SCHEMA_VERSION,
        type: 'memory.extract.requested',
        eventId: outboxEventId,
        runId: run.run.id,
        traceId: run.traceId,
      };
      await tx`
        INSERT INTO outbox_events (id, tenant_id, event_type, payload)
        VALUES (${outboxEventId}, ${row.tenant_id}, ${job.type}, ${tx.json(job)})
      `;
    });
  }

  async interrupt(run: ClaimedRun, outcome: InterruptedOutcome): Promise<void> {
    await this.sql.begin(async (tx) => {
      const rows = await tx<Array<{ id: string }>>`
        UPDATE agent_runs
        SET status = 'waiting_approval', updated_at = now(), version = version + 1
        WHERE id = ${run.run.id} AND status = 'running'
          AND version = ${run.expectedVersion}
        RETURNING id
      `;
      if (!rows[0]) throw new Error(`Run ${run.run.id} interrupt lost an optimistic lock race.`);
      await appendRunEvent(tx, run.run.id, 'run.approval_required', outcome.approvalRequest);
    });
  }

  async fail(
    run: ClaimedRun,
    failure: { code: string; message: string; retryable: boolean },
  ): Promise<void> {
    const status = failure.retryable ? 'queued' : 'failed';
    await this.sql.begin(async (tx) => {
      const updated = await tx<Array<{ id: string }>>`
        UPDATE agent_runs
        SET status = ${status}, updated_at = now(), version = version + 1,
            completed_at = CASE WHEN ${failure.retryable} THEN NULL ELSE now() END,
            failure_code = ${failure.code},
            failure_message = ${failure.message.slice(0, 4000)}
        WHERE id = ${run.run.id} AND status = 'running'
          AND version = ${run.expectedVersion}
        RETURNING id
      `;
      if (!updated[0]) return;
      await appendRunEvent(tx, run.run.id, 'run.failed', failure);
    });
  }
}

async function appendRunEvent(
  sql: QueryableDatabase,
  runId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  const sequenceRows = await sql<Array<{ next_sequence: number }>>`
    SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
    FROM run_events WHERE run_id = ${runId}
  `;
  const sequence = Number(sequenceRows[0]?.next_sequence ?? 1);
  await sql`
    INSERT INTO run_events (id, run_id, sequence, event_type, payload)
    VALUES (${randomUUID()}, ${runId}, ${sequence}, ${eventType}, ${sql.json(payload as never)})
  `;
}

type RunRow = {
  id: string;
  tenant_id: string;
  thread_id: string;
  conversation_id: string;
  user_id: string;
  source_message_id: string;
  status: AgentRun['status'];
  attempt: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  failure_code: string | null;
  failure_message: string | null;
};

function toAgentRun(row: RunRow): AgentRun {
  return agentRunSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    threadId: row.thread_id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    sourceMessageId: row.source_message_id,
    status: row.status,
    attempt: row.attempt,
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt: row.started_at ? toIso(row.started_at) : null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

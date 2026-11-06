import { randomUUID } from 'node:crypto';
import type {
  MemoryCandidate,
  MemoryContext,
  MemoryExtractionInput,
  MemoryNode,
  MemoryRepository,
  RetrievedMemory,
} from '@dafeiyu/memory';
import type { Database } from './client.js';

export class PostgresMemoryRepository implements MemoryRepository {
  constructor(private readonly sql: Database) {}

  async retrieve(
    context: MemoryContext,
    query: string,
    limit: number,
  ): Promise<RetrievedMemory> {
    const pattern = `%${escapeLike(query)}%`;
    const rows = await this.sql<Array<MemoryRow>>`
      SELECT *,
        CASE WHEN summary ILIKE ${pattern} THEN 1 ELSE 0 END AS lexical_match
      FROM memory_nodes
      WHERE tenant_id = ${context.tenantId}
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          (owner_type = 'user' AND owner_id = ${context.userId}) OR
          (owner_type = 'conversation' AND owner_id = ${context.conversationId})
        )
      ORDER BY lexical_match DESC, importance DESC, updated_at DESC
      LIMIT ${limit}
    `;
    return { nodes: rows.map(toMemoryNode) };
  }

  async listRecent(
    context: MemoryContext,
    limit: number,
  ): Promise<readonly MemoryNode[]> {
    const rows = await this.sql<Array<MemoryRow>>`
      SELECT * FROM memory_nodes
      WHERE tenant_id = ${context.tenantId}
        AND status = 'active'
        AND (
          (owner_type = 'user' AND owner_id = ${context.userId}) OR
          (owner_type = 'conversation' AND owner_id = ${context.conversationId})
        )
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map(toMemoryNode);
  }

  async insertCandidates(
    context: MemoryContext,
    candidates: readonly MemoryCandidate[],
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      for (const candidate of candidates) {
        if (candidate.confidence < 0.6) continue;
        const ownerId =
          candidate.ownerType === 'user' ? context.userId : context.conversationId;
        const memoryId = randomUUID();
        const inserted = await tx<Array<{ id: string }>>`
          INSERT INTO memory_nodes (
            id, tenant_id, owner_type, owner_id, category, summary,
            importance, confidence, tags, occurred_at
          ) VALUES (
            ${memoryId}, ${context.tenantId}, ${candidate.ownerType}, ${ownerId},
            ${candidate.category}, ${candidate.summary}, ${candidate.importance},
            ${candidate.confidence}, ${candidate.tags as string[]}, now()
          )
          ON CONFLICT (tenant_id, owner_type, owner_id, summary)
            WHERE status = 'active'
          DO NOTHING
          RETURNING id
        `;
        const nodeId = inserted[0]?.id;
        if (!nodeId) {
          const rows = await tx<Array<{ id: string }>>`
            SELECT id FROM memory_nodes
            WHERE tenant_id = ${context.tenantId}
              AND owner_type = ${candidate.ownerType}
              AND owner_id = ${ownerId}
              AND status = 'active'
              AND summary = ${candidate.summary}
            LIMIT 1
          `;
          const existingId = rows[0]?.id;
          if (existingId) {
            await tx`
              INSERT INTO memory_sources (memory_node_id, message_id, relation)
              VALUES (${existingId}, ${context.sourceMessageId}, 'confirms')
              ON CONFLICT DO NOTHING
            `;
          }
          continue;
        }
        await tx`
          INSERT INTO memory_sources (memory_node_id, message_id, relation)
          VALUES (${nodeId}, ${context.sourceMessageId}, 'derived_from')
        `;
      }
    });
  }
}

export class PostgresMemoryJobStore {
  constructor(private readonly sql: Database) {}

  async claimExtraction(runId: string): Promise<boolean> {
    const rows = await this.sql<Array<{ run_id: string }>>`
      INSERT INTO memory_extractions (run_id, status, attempts, started_at)
      VALUES (${runId}, 'running', 1, now())
      ON CONFLICT (run_id) DO UPDATE SET
        status = 'running', attempts = memory_extractions.attempts + 1,
        started_at = now(), updated_at = now(), last_error = NULL
      WHERE memory_extractions.status IN ('queued', 'failed')
      RETURNING run_id
    `;
    return Boolean(rows[0]);
  }

  async completeExtraction(runId: string): Promise<void> {
    await this.sql`
      UPDATE memory_extractions
      SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE run_id = ${runId} AND status = 'running'
    `;
  }

  async failExtraction(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.sql`
      UPDATE memory_extractions
      SET status = 'failed', last_error = ${message.slice(0, 4000)}, updated_at = now()
      WHERE run_id = ${runId} AND status = 'running'
    `;
  }

  async loadExtractionInput(runId: string): Promise<MemoryExtractionInput | null> {
    const rows = await this.sql<Array<{
      tenant_id: string;
      user_id: string;
      conversation_id: string;
      source_message_id: string;
      user_text: string;
      assistant_text: string;
    }>>`
      SELECT r.tenant_id, r.user_id, r.conversation_id, r.source_message_id,
             source.content AS user_text,
             assistant.content AS assistant_text
      FROM agent_runs r
      JOIN messages source ON source.id = r.source_message_id
      JOIN messages assistant ON assistant.id = r.result_message_id
      WHERE r.id = ${runId} AND r.status = 'completed'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    const context: MemoryContext = {
      tenantId: row.tenant_id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      runId,
      sourceMessageId: row.source_message_id,
    };
    const repository = new PostgresMemoryRepository(this.sql);
    return {
      context,
      userText: row.user_text,
      assistantText: row.assistant_text,
      existingNodes: await repository.listRecent(context, 20),
    };
  }
}

function toMemoryNode(row: MemoryRow): MemoryNode {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    category: row.category,
    summary: row.summary,
    importance: row.importance,
    confidence: row.confidence,
    tags: row.tags,
    sourceMessageIds: [],
    ...(row.occurred_at ? { occurredAt: toIso(row.occurred_at) } : {}),
    ...(row.expires_at ? { expiresAt: toIso(row.expires_at) } : {}),
  };
}

type MemoryRow = {
  id: string;
  owner_type: MemoryNode['ownerType'];
  owner_id: string;
  category: MemoryNode['category'];
  summary: string;
  importance: 1 | 2 | 3;
  confidence: number;
  tags: string[];
  occurred_at: Date | string | null;
  expires_at: Date | string | null;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

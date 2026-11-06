import { agentRunSchema, type AgentRun, type MessageDto } from '@dafeiyu/contracts';
import type { Database } from './client.js';

export class PostgresReadModel {
  constructor(private readonly sql: Database) {}

  async getRun(runId: string): Promise<AgentRun | null> {
    const rows = await this.sql<Array<RunRow>>`
      SELECT * FROM agent_runs WHERE id = ${runId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
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

  async listMessages(conversationId: string, limit = 100): Promise<readonly MessageDto[]> {
    const rows = await this.sql<Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      created_at: Date | string;
    }>>`
      SELECT id, role, content, created_at
      FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY occurred_at ASC, created_at ASC, id ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: toIso(row.created_at),
    }));
  }

  async getRunMemory(runId: string): Promise<{
    extractionStatus: string | null;
    memories: readonly { id: string; category: string; summary: string }[];
  }> {
    const statusRows = await this.sql<Array<{ status: string }>>`
      SELECT status FROM memory_extractions WHERE run_id = ${runId} LIMIT 1
    `;
    const memories = await this.sql<Array<{
      id: string;
      category: string;
      summary: string;
    }>>`
      SELECT DISTINCT n.id, n.category, n.summary
      FROM agent_runs r
      JOIN memory_sources s ON s.message_id = r.source_message_id
      JOIN memory_nodes n ON n.id = s.memory_node_id
      WHERE r.id = ${runId} AND n.status = 'active'
      ORDER BY n.id
    `;
    return {
      extractionStatus: statusRows[0]?.status ?? null,
      memories,
    };
  }
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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

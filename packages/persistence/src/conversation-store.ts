import { randomUUID } from 'node:crypto';
import {
  SCHEMA_VERSION,
  type DurableJob,
  type NormalizedInboundEvent,
} from '@dafeiyu/contracts';
import type {
  ConversationIntakeStore,
  IntakeResult,
} from '@dafeiyu/conversation';
import type { Database, QueryableDatabase } from './client.js';

export class PostgresConversationIntakeStore implements ConversationIntakeStore {
  constructor(private readonly sql: Database) {}

  async acceptInbound(event: NormalizedInboundEvent): Promise<IntakeResult> {
    return this.sql.begin(async (tx) => {
      const tenantId = await upsertTenant(tx, event.tenantKey);
      const installationId = await upsertInstallation(
        tx,
        tenantId,
        event.platform,
        event.installationId,
      );
      const inboundEventId = randomUUID();
      const claimed = await tx<Array<{ id: string }>>`
        INSERT INTO inbound_events (
          id, tenant_id, installation_id, platform, external_event_id, received_at
        ) VALUES (
          ${inboundEventId}, ${tenantId}, ${installationId}, ${event.platform},
          ${event.externalEventId}, ${event.receivedAt}
        )
        ON CONFLICT (installation_id, external_event_id) DO NOTHING
        RETURNING id
      `;
      if (!claimed[0]) {
        const duplicate = await findDuplicate(
          tx,
          installationId,
          event.externalEventId,
        );
        if (!duplicate) {
          throw new Error('Duplicate event exists without its durable Agent run.');
        }
        return duplicate;
      }

      const userId = await upsertUser(
        tx,
        tenantId,
        installationId,
        event.externalSenderId,
        event.senderDisplayName,
      );
      const conversationId = await upsertConversation(
        tx,
        tenantId,
        installationId,
        event,
      );
      await tx`
        INSERT INTO conversation_members (conversation_id, user_id)
        VALUES (${conversationId}, ${userId})
        ON CONFLICT DO NOTHING
      `;

      const messageId = randomUUID();
      await tx`
        INSERT INTO messages (
          id, tenant_id, conversation_id, sender_user_id, inbound_event_id,
          role, content, external_message_id, occurred_at
        ) VALUES (
          ${messageId}, ${tenantId}, ${conversationId}, ${userId}, ${inboundEventId},
          'user', ${event.content.text}, ${event.externalEventId}, ${event.occurredAt}
        )
      `;

      const runId = randomUUID();
      const traceId = randomUUID();
      await tx`
        INSERT INTO agent_runs (
          id, tenant_id, thread_id, conversation_id, user_id, source_message_id, status
        ) VALUES (
          ${runId}, ${tenantId}, ${conversationId}, ${conversationId}, ${userId},
          ${messageId}, 'queued'
        )
      `;

      const outboxEventId = randomUUID();
      const job: DurableJob = {
        schemaVersion: SCHEMA_VERSION,
        type: 'agent.run.requested',
        eventId: outboxEventId,
        runId,
        traceId,
      };
      await tx`
        INSERT INTO outbox_events (id, tenant_id, event_type, payload)
        VALUES (${outboxEventId}, ${tenantId}, ${job.type}, ${tx.json(job)})
      `;

      return {
        accepted: true,
        duplicate: false,
        messageId,
        runId,
        conversationId,
        status: 'queued',
      };
    });
  }
}

async function findDuplicate(
  sql: QueryableDatabase,
  installationId: string,
  externalEventId: string,
): Promise<IntakeResult | null> {
  const rows = await sql<Array<{
    message_id: string;
    run_id: string;
    conversation_id: string;
    status: IntakeResult['status'];
  }>>`
    SELECT m.id AS message_id, r.id AS run_id, m.conversation_id, r.status
    FROM inbound_events e
    JOIN messages m ON m.inbound_event_id = e.id
    JOIN agent_runs r ON r.source_message_id = m.id
    WHERE e.installation_id = ${installationId}
      AND e.external_event_id = ${externalEventId}
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? {
        accepted: true,
        duplicate: true,
        messageId: row.message_id,
        runId: row.run_id,
        conversationId: row.conversation_id,
        status: row.status,
      }
    : null;
}

async function upsertTenant(sql: QueryableDatabase, tenantKey: string): Promise<string> {
  const id = randomUUID();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO tenants (id, tenant_key, name)
    VALUES (${id}, ${tenantKey}, ${tenantKey})
    ON CONFLICT (tenant_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  return requiredId(rows[0], 'tenant');
}

async function upsertInstallation(
  sql: QueryableDatabase,
  tenantId: string,
  platform: string,
  externalId: string,
): Promise<string> {
  const id = randomUUID();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO platform_installations (
      id, tenant_id, platform, external_installation_id
    ) VALUES (${id}, ${tenantId}, ${platform}, ${externalId})
    ON CONFLICT (tenant_id, platform, external_installation_id)
    DO UPDATE SET platform = EXCLUDED.platform
    RETURNING id
  `;
  return requiredId(rows[0], 'installation');
}

async function upsertUser(
  sql: QueryableDatabase,
  tenantId: string,
  installationId: string,
  externalUserId: string,
  displayName: string | undefined,
): Promise<string> {
  const id = randomUUID();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO users (
      id, tenant_id, installation_id, external_user_id, display_name
    ) VALUES (${id}, ${tenantId}, ${installationId}, ${externalUserId}, ${displayName ?? null})
    ON CONFLICT (installation_id, external_user_id) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      updated_at = now()
    RETURNING id
  `;
  return requiredId(rows[0], 'user');
}

async function upsertConversation(
  sql: QueryableDatabase,
  tenantId: string,
  installationId: string,
  event: NormalizedInboundEvent,
): Promise<string> {
  const id = randomUUID();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO conversations (
      id, tenant_id, installation_id, external_conversation_id, kind, title
    ) VALUES (
      ${id}, ${tenantId}, ${installationId}, ${event.externalConversationId},
      ${event.conversationKind}, ${event.conversationTitle ?? null}
    )
    ON CONFLICT (installation_id, external_conversation_id) DO UPDATE SET
      kind = EXCLUDED.kind,
      title = COALESCE(EXCLUDED.title, conversations.title),
      updated_at = now()
    RETURNING id
  `;
  return requiredId(rows[0], 'conversation');
}

function requiredId(row: { id: string } | undefined, entity: string): string {
  if (!row) throw new Error(`Failed to resolve ${entity} id.`);
  return row.id;
}

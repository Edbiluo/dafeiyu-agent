import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type NormalizedInboundEvent } from '@dafeiyu/contracts';
import type { Telemetry } from '@dafeiyu/observability';
import {
  ConversationService,
  UnsupportedInboundEventError,
  type ConversationIntakeStore,
} from './index.js';

const event: NormalizedInboundEvent = {
  schemaVersion: SCHEMA_VERSION,
  tenantKey: 'test',
  platform: 'web',
  installationId: 'web-test',
  externalEventId: crypto.randomUUID(),
  externalConversationId: crypto.randomUUID(),
  conversationKind: 'dm',
  externalSenderId: crypto.randomUUID(),
  senderDisplayName: 'Miles',
  senderIsBot: false,
  content: { type: 'text', text: 'hello' },
  occurredAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
};

const telemetry: Telemetry = {
  recordEvent: vi.fn(),
  recordError: vi.fn(),
  measure: async (_name, operation) => operation(),
};

describe('ConversationService', () => {
  it('delegates intake to one atomic store operation', async () => {
    const expected = {
      accepted: true as const,
      duplicate: false,
      messageId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      status: 'queued' as const,
    };
    const store: ConversationIntakeStore = { acceptInbound: vi.fn(async () => expected) };
    const service = new ConversationService(store, telemetry);

    await expect(service.accept(event)).resolves.toEqual(expected);
    expect(store.acceptInbound).toHaveBeenCalledOnce();
  });

  it('rejects bot-authored events before persistence', async () => {
    const store: ConversationIntakeStore = {
      acceptInbound: vi.fn(async () => {
        throw new Error('must not be called');
      }),
    };
    const service = new ConversationService(store, telemetry);

    await expect(service.accept({ ...event, senderIsBot: true })).rejects.toBeInstanceOf(
      UnsupportedInboundEventError,
    );
    expect(store.acceptInbound).not.toHaveBeenCalled();
  });
});

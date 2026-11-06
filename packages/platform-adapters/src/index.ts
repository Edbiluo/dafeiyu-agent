import {
  SCHEMA_VERSION,
  type NormalizedInboundEvent,
  type Platform,
  type SendMessageRequest,
} from '@dafeiyu/contracts';

export type OutgoingMessage = {
  conversationExternalId: string;
  text: string;
  replyToExternalMessageId?: string;
  idempotencyKey: string;
};

/** A platform boundary. Adapters must not call models or repositories directly. */
export interface PlatformAdapter {
  readonly platform: Platform;
  verifyInbound(request: unknown): Promise<void>;
  normalizeInbound(request: unknown): Promise<NormalizedInboundEvent | null>;
  send(message: OutgoingMessage): Promise<void>;
}

export function normalizeWebMessage(
  request: SendMessageRequest,
  now = new Date(),
): NormalizedInboundEvent {
  const timestamp = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    tenantKey: 'local-demo',
    platform: 'web',
    installationId: 'local-web',
    externalEventId: request.clientMessageId,
    externalConversationId: request.clientConversationId,
    conversationKind: 'dm',
    externalSenderId: request.clientUserId,
    senderDisplayName: request.displayName,
    senderIsBot: false,
    content: { type: 'text', text: request.text },
    occurredAt: timestamp,
    receivedAt: timestamp,
  };
}

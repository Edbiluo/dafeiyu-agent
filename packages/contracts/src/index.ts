import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const uuidSchema = z.uuid();
export const dateTimeSchema = z.iso.datetime({ offset: true });

export const platformSchema = z.enum(['qq', 'feishu', 'web', 'livestream']);
export type Platform = z.infer<typeof platformSchema>;

export const conversationKindSchema = z.enum(['dm', 'group', 'livestream']);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(20_000),
});
export type TextContent = z.infer<typeof textContentSchema>;

/** Trusted output from a platform adapter, never accepted directly from browsers. */
export const normalizedInboundEventSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  tenantKey: z.string().trim().min(1).max(100),
  platform: platformSchema,
  installationId: z.string().trim().min(1).max(255),
  externalEventId: z.string().trim().min(1).max(255),
  externalConversationId: z.string().trim().min(1).max(255),
  conversationKind: conversationKindSchema,
  conversationTitle: z.string().trim().min(1).max(255).optional(),
  externalSenderId: z.string().trim().min(1).max(255),
  senderDisplayName: z.string().trim().min(1).max(100).optional(),
  senderIsBot: z.boolean(),
  content: textContentSchema,
  occurredAt: dateTimeSchema,
  receivedAt: dateTimeSchema,
});
export type NormalizedInboundEvent = z.infer<typeof normalizedInboundEventSchema>;

export const agentRunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const agentRunSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  threadId: uuidSchema,
  conversationId: uuidSchema,
  userId: uuidSchema,
  sourceMessageId: uuidSchema,
  status: agentRunStatusSchema,
  attempt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  startedAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const runRequestedJobSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  type: z.literal('agent.run.requested'),
  eventId: uuidSchema,
  runId: uuidSchema,
  traceId: uuidSchema,
});

export const memoryExtractionJobSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  type: z.literal('memory.extract.requested'),
  eventId: uuidSchema,
  runId: uuidSchema,
  traceId: uuidSchema,
});

export const durableJobSchema = z.discriminatedUnion('type', [
  runRequestedJobSchema,
  memoryExtractionJobSchema,
]);
export type DurableJob = z.infer<typeof durableJobSchema>;

export const sendMessageRequestSchema = z.object({
  clientMessageId: uuidSchema,
  clientUserId: uuidSchema,
  clientConversationId: uuidSchema,
  displayName: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(20_000),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const acceptedMessageResponseSchema = z.object({
  accepted: z.literal(true),
  duplicate: z.boolean(),
  messageId: uuidSchema,
  runId: uuidSchema,
  conversationId: uuidSchema,
  status: agentRunStatusSchema,
});
export type AcceptedMessageResponse = z.infer<typeof acceptedMessageResponseSchema>;

export const messageDtoSchema = z.object({
  id: uuidSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: dateTimeSchema,
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

export const MAX_AGENT_RUN_ATTEMPTS = 3;

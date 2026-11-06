import type {
  AgentRunStatus,
  NormalizedInboundEvent,
} from '@dafeiyu/contracts';
import type { Telemetry } from '@dafeiyu/observability';

export type IntakeRecord = {
  messageId: string;
  runId: string;
  conversationId: string;
  status: AgentRunStatus;
};

export type IntakeResult = IntakeRecord & {
  accepted: true;
  duplicate: boolean;
};

/** Executes event receipt, message, run, and outbox insertion atomically. */
export interface ConversationIntakeStore {
  acceptInbound(event: NormalizedInboundEvent): Promise<IntakeResult>;
}

export class ConversationService {
  constructor(
    private readonly store: ConversationIntakeStore,
    private readonly telemetry: Telemetry,
  ) {}

  async accept(event: NormalizedInboundEvent): Promise<IntakeResult> {
    if (event.senderIsBot) {
      throw new UnsupportedInboundEventError('Messages sent by bots are ignored.');
    }

    const result = await this.telemetry.measure(
      'conversation.accept',
      () => this.store.acceptInbound(event),
      { platform: event.platform, conversation_kind: event.conversationKind },
    );
    this.telemetry.recordEvent('conversation.accepted', {
      platform: event.platform,
      duplicate: result.duplicate,
    });
    return result;
  }
}

export class UnsupportedInboundEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedInboundEventError';
  }
}

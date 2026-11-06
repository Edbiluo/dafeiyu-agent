import type { NormalizedInboundEvent } from '@dafeiyu/contracts';
import type { ZodType } from 'zod';

export type ToolPermission = 'read' | 'write' | 'external_send' | 'admin';

export type ToolContext = {
  runId: string;
  message: NormalizedInboundEvent;
};

export type ToolResult = {
  content: string;
  metadata?: Record<string, string>;
};

export interface AgentTool<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodType<TInput>;
  readonly permission: ToolPermission;
  readonly requiresApproval: boolean;
  readonly timeoutMs: number;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}

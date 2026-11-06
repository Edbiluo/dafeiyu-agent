import type {
  AcceptedMessageResponse,
  AgentRun,
  MessageDto,
  SendMessageRequest,
} from '@dafeiyu/contracts';

export type DesktopSkin = 'q' | 'mature';
export type DesktopWindowMode = 'pet' | 'chat';

export type RunMemoryResponse = {
  extractionStatus: string | null;
  memories: readonly { id: string; category: string; summary: string }[];
};

export type DafeiyuDesktopApi = {
  sendMessage(request: SendMessageRequest): Promise<AcceptedMessageResponse>;
  getRun(runId: string): Promise<AgentRun>;
  getMessages(conversationId: string): Promise<readonly MessageDto[]>;
  getMemory(runId: string): Promise<RunMemoryResponse>;
  setWindowMode(mode: DesktopWindowMode): Promise<void>;
  roamWindow(): Promise<void>;
  hideWindow(): Promise<void>;
  quitApp(): Promise<void>;
  showContextMenu(): Promise<void>;
};

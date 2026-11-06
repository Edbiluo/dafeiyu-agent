import {
  type AgentExecutionOutcome,
  type AgentRuntime,
  type ApprovalCommand,
  type ChatMessage,
  type ModelGateway,
  type RunExecutionContext,
} from '@dafeiyu/agent-core';
import type { MemoryNode, MemoryRepository } from '@dafeiyu/memory';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

const GraphState = Annotation.Root({
  context: Annotation<RunExecutionContext>(),
  memories: Annotation<readonly MemoryNode[]>(),
  outcome: Annotation<AgentExecutionOutcome>(),
});

export class LangGraphAgentRuntime implements AgentRuntime {
  private readonly invokeGraph: (
    context: RunExecutionContext,
  ) => Promise<AgentExecutionOutcome>;

  constructor(
    memoryRepository: MemoryRepository,
    model: ModelGateway,
  ) {
    const graph = new StateGraph(GraphState)
      .addNode('retrieve_memory', async (state) => {
        const context = state.context;
        const memory = await memoryRepository.retrieve(
          {
            tenantId: context.run.tenantId,
            userId: context.run.userId,
            conversationId: context.run.conversationId,
            runId: context.run.id,
            sourceMessageId: context.run.sourceMessageId,
          },
          context.currentMessage.content,
          8,
        );
        return { memories: memory.nodes };
      })
      .addNode('respond', async (state) => {
        const prompt: ChatMessage[] = [
          { role: 'system', content: buildSystemPrompt(state.memories ?? []) },
          ...state.context.history,
          state.context.currentMessage,
        ];
        const response = await model.complete({
          messages: prompt,
          temperature: 0.7,
          timeoutMs: 60_000,
          responseFormat: 'text',
        });
        return {
          outcome: {
            type: 'completed' as const,
            text: response.text,
            ...(response.usage ? { usage: response.usage } : {}),
          },
        };
      })
      .addEdge(START, 'retrieve_memory')
      .addEdge('retrieve_memory', 'respond')
      .addEdge('respond', END)
      .compile();

    this.invokeGraph = async (context) => {
      const state = await graph.invoke({ context });
      if (!state.outcome) throw new Error('LangGraph completed without an outcome.');
      return state.outcome;
    };
  }

  execute(context: RunExecutionContext): Promise<AgentExecutionOutcome> {
    return this.invokeGraph(context);
  }

  async resume(_command: ApprovalCommand): Promise<AgentExecutionOutcome> {
    throw new Error('Approval resume is not enabled in the first vertical slice.');
  }
}

function buildSystemPrompt(memories: readonly MemoryNode[]): string {
  const memoryText = memories.length
    ? memories
        .map((memory) => `- [${memory.category}] ${memory.summary}`)
        .join('\n')
    : '- 暂无相关长期记忆。';

  return `你是“大肥鱼”，一个友好、可靠、行动受控的中文 AI Agent。

回复要求：
- 先准确解决用户当前问题，语言自然简洁。
- 不伪造实时信息、工具结果、个人经历或已经完成的操作。
- 当前尚未提供工具时，不能声称自己查询、发送、创建或删除了任何外部数据。
- 记忆只作为背景事实；若与用户当前说法冲突，以当前说法为准。
- 不索取密码、验证码、API Key 或其他敏感凭据。

检索到的相关记忆：
${memoryText}`;
}

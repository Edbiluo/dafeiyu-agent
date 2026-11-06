import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  RetryableAgentError,
  type ChatMessage,
  type ModelGateway,
  type ModelRequest,
  type ModelResponse,
} from '@dafeiyu/agent-core';

export type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export class OpenAICompatibleModelGateway implements ModelGateway {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.client = new OpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.config.model,
          messages: request.messages.map(toProviderMessage),
          ...(request.temperature === undefined
            ? {}
            : { temperature: request.temperature }),
          ...(request.responseFormat === 'json'
            ? { response_format: { type: 'json_object' as const } }
            : {}),
        },
        { signal: AbortSignal.timeout(request.timeoutMs) },
      );
      const choice = response.choices[0];
      if (!choice) throw new Error('Model returned no completion choice.');
      const text = choice.message.content?.trim();
      if (!text) throw new Error('Model returned no text content.');

      return {
        text,
        provider: 'openai-compatible',
        model: response.model,
        ...(choice.finish_reason ? { finishReason: choice.finish_reason } : {}),
        ...(response.usage
          ? {
              usage: {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              },
            }
          : {}),
      };
    } catch (error) {
      if (isRetryable(error)) {
        throw new RetryableAgentError('MODEL_TEMPORARILY_UNAVAILABLE', formatError(error));
      }
      throw error;
    }
  }
}

export class MockModelGateway implements ModelGateway {
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((message) => message.role === 'user')?.content;
    const text =
      request.responseFormat === 'json'
        ? buildMockJsonResponse(lastUserMessage)
        : `呜呀，我收到啦：${lastUserMessage ?? '你好'}。这是本地 Mock 模型回复，配置 DeepSeek 后会切换为真实模型。`;
    return { text, provider: 'mock', model: 'mock-dafeiyu' };
  }
}

function buildMockJsonResponse(message: string | undefined): string {
  try {
    const parsed = JSON.parse(message ?? '{}') as {
      turn?: { user?: unknown };
    };
    const userText = parsed.turn?.user;
    if (typeof userText === 'string' && userText.trim()) {
      return JSON.stringify({
        candidates: [
          {
            ownerType: 'user',
            category: 'event',
            summary: `用户提到：${userText.trim().slice(0, 200)}`,
            importance: 2,
            confidence: 0.9,
            tags: ['本地验证'],
          },
        ],
      });
    }
  } catch {
    // Invalid test data produces no memory candidate.
  }
  return JSON.stringify({ candidates: [] });
}

function toProviderMessage(message: ChatMessage): ChatCompletionMessageParam {
  if (message.role === 'tool') {
    if (!message.toolCallId) throw new Error('Tool message requires toolCallId.');
    return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
  }
  if (message.role === 'assistant') {
    return { role: 'assistant', content: message.content };
  }
  if (message.role === 'system') {
    return { role: 'system', content: message.content };
  }
  return { role: 'user', content: message.content };
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  return error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.APIConnectionTimeoutError;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

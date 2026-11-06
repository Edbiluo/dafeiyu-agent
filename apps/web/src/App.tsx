import { useEffect, useRef, useState } from 'react';
import type {
  AcceptedMessageResponse,
  AgentRun,
  MessageDto,
} from '@dafeiyu/contracts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3100';
const clientUserId = storedUuid('dafeiyu.userId');
const clientConversationId = storedUuid('dafeiyu.conversationId');

export function App() {
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('dafeiyu.displayName') || 'Miles',
  );
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<readonly MessageDto[]>([]);
  const [memories, setMemories] = useState<
    readonly { id: string; category: string; summary: string }[]
  >([]);
  const [conversationId, setConversationId] = useState<string | null>(
    () => localStorage.getItem('dafeiyu.internalConversationId'),
  );
  const [status, setStatus] = useState('等待输入');
  const [sending, setSending] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) {
      void refreshMessages(conversationId, setMessages).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    }
  }, [conversationId]);

  useEffect(() => {
    timeline.current?.scrollTo({ top: timeline.current.scrollHeight });
  }, [messages, status]);

  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setStatus('消息已提交，Agent 正在运行');
    setText('');
    localStorage.setItem('dafeiyu.displayName', displayName.trim() || '访客');

    try {
      const response = await fetch(`${API_URL}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientMessageId: crypto.randomUUID(),
          clientUserId,
          clientConversationId,
          displayName: displayName.trim() || '访客',
          text: message,
        }),
      });
      if (!response.ok) throw new Error(`提交失败：HTTP ${response.status}`);
      const accepted = (await response.json()) as AcceptedMessageResponse;
      setConversationId(accepted.conversationId);
      localStorage.setItem('dafeiyu.internalConversationId', accepted.conversationId);
      await refreshMessages(accepted.conversationId, setMessages);
      await waitForRun(accepted.runId, accepted.conversationId, setMessages, setStatus);
      setMemories(await waitForMemory(accepted.runId));
      setStatus('执行完成，记忆已归档');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="shell">
      <header className="hero">
        <div className="whale" aria-hidden="true">鲸</div>
        <div>
          <p className="eyebrow">DURABLE AGENT CONSOLE</p>
          <h1>大肥鱼</h1>
          <p>持久会话、异步执行和长期记忆的本地验证台</p>
        </div>
        <span className="status-dot">{status}</span>
      </header>

      <section className="chat-panel">
        <div className="timeline" ref={timeline}>
          {messages.length === 0 ? (
            <div className="empty">
              <strong>从一个真实任务开始</strong>
              <span>例如：记住我正在开发一个成熟的 Agent 应用。</span>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? displayName : '大肥鱼'}</span>
                <p>{message.content}</p>
                <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
              </article>
            ))
          )}
        </div>

        <div className="composer">
          <label>
            你的称呼
            <input
              value={displayName}
              maxLength={100}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <textarea
            value={text}
            placeholder="输入消息，Ctrl + Enter 发送"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === 'Enter') void send();
            }}
          />
          <button type="button" disabled={sending || !text.trim()} onClick={() => void send()}>
            {sending ? '执行中…' : '发送给 Agent'}
          </button>
        </div>
      </section>

      <section className="memory-panel">
        <p className="eyebrow">MEMORY NODES</p>
        <h2>本轮长期记忆</h2>
        {memories.length === 0 ? (
          <p className="memory-empty">发送一条包含项目、决定或偏好的消息后，这里会显示异步提取结果。</p>
        ) : (
          <ul>
            {memories.map((memory) => (
              <li key={memory.id}>
                <span>{memory.category}</span>
                {memory.summary}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

async function waitForMemory(
  runId: string,
): Promise<readonly { id: string; category: string; summary: string }[]> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(`${API_URL}/v1/runs/${runId}/memory`);
    if (!response.ok) throw new Error(`读取记忆失败：HTTP ${response.status}`);
    const result = (await response.json()) as {
      extractionStatus: string | null;
      memories: readonly { id: string; category: string; summary: string }[];
    };
    if (result.extractionStatus === 'completed') return result.memories;
    if (result.extractionStatus === 'failed') throw new Error('本轮记忆提取失败。');
    await delay(500);
  }
  throw new Error('等待记忆归档超时。');
}

async function waitForRun(
  runId: string,
  conversationId: string,
  setMessages: (messages: readonly MessageDto[]) => void,
  setStatus: (status: string) => void,
): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${API_URL}/v1/runs/${runId}`);
    if (!response.ok) throw new Error(`读取任务失败：HTTP ${response.status}`);
    const run = (await response.json()) as AgentRun;
    setStatus(statusLabel(run.status));
    if (run.status === 'completed') {
      await refreshMessages(conversationId, setMessages);
      return;
    }
    if (run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(run.failureMessage || `任务状态：${run.status}`);
    }
    await delay(500);
  }
  throw new Error('等待 Agent 超时，请检查 Worker 日志。');
}

async function refreshMessages(
  conversationId: string,
  setMessages: (messages: readonly MessageDto[]) => void,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/v1/conversations/${conversationId}/messages`,
  );
  if (!response.ok) {
    throw new Error(`读取消息历史失败：HTTP ${response.status}`);
  }
  const data = (await response.json()) as { messages: readonly MessageDto[] };
  setMessages(data.messages);
}

function statusLabel(status: AgentRun['status']): string {
  const labels: Record<AgentRun['status'], string> = {
    queued: '等待 Worker',
    running: 'Agent 执行中',
    waiting_approval: '等待人工审批',
    completed: '执行完成',
    failed: '执行失败',
    cancelled: '已取消',
  };
  return labels[status];
}

function storedUuid(key: string): string {
  const current = localStorage.getItem(key);
  if (current) return current;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

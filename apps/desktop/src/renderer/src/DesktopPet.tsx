import { useEffect, useRef, useState } from 'react';
import type { AgentRun, MessageDto } from '@dafeiyu/contracts';
import type { DesktopSkin } from '../../shared/contracts.js';

const SKINS: Record<DesktopSkin, { src: string; label: string }> = {
  q: { src: './dafeiyu-q-transparent.png', label: 'Q版' },
  mature: { src: './dafeiyu-whale-girl-transparent.png', label: '成熟版' },
};

const IDLE_BEHAVIORS: readonly IdleBehavior[] = ['happy', 'sleeping', 'wandering'];

export function DesktopPet() {
  const [skin, setSkin] = useState<DesktopSkin>(
    () => (localStorage.getItem('dafeiyu.desktop.skin') as DesktopSkin) || 'q',
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [text, setText] = useState('');
  const [reply, setReply] = useState('戳戳我，我会自己散步和打瞌睡。');
  const [state, setState] = useState<PetState>('idle');
  const [messages, setMessages] = useState<readonly MessageDto[]>([]);
  const behaviorToken = useRef(0);
  const userId = stableUuid('dafeiyu.desktop.user');
  const conversationKey = stableUuid('dafeiyu.desktop.conversation');
  const [conversationId, setConversationId] = useState<string | null>(
    () => localStorage.getItem('dafeiyu.desktop.internalConversation'),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setBubbleVisible(false), 5_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void window.dafeiyu
      .getMessages(conversationId)
      .then(setMessages)
      .catch(() => setState('offline'));
  }, [conversationId]);

  useEffect(() => {
    if (panelOpen || state !== 'idle') return;
    const timer = window.setTimeout(() => {
      const behavior = IDLE_BEHAVIORS[Math.floor(Math.random() * IDLE_BEHAVIORS.length)];
      if (behavior) void playIdleBehavior(behavior);
    }, randomInteger(12_000, 28_000));
    return () => window.clearTimeout(timer);
  }, [panelOpen, state]);

  const playIdleBehavior = async (behavior: IdleBehavior) => {
    const token = ++behaviorToken.current;
    const configuration = {
      happy: { message: '嘿嘿，摸鱼时间到～', duration: 2_200 },
      sleeping: { message: 'Zzz…我只睡一小会儿。', duration: 4_200 },
      wandering: { message: '我去桌面上散个步！', duration: 2_600 },
    }[behavior];
    setState(behavior);
    setReply(configuration.message);
    setBubbleVisible(true);
    if (behavior === 'wandering') await window.dafeiyu.roamWindow();
    await delay(configuration.duration);
    if (behaviorToken.current !== token) return;
    setState('idle');
    setBubbleVisible(false);
  };

  const setChatOpen = async (open: boolean) => {
    behaviorToken.current += 1;
    setState('idle');
    setPanelOpen(open);
    setBubbleVisible(!open);
    await window.dafeiyu.setWindowMode(open ? 'chat' : 'pet');
  };

  const interact = () => {
    if (panelOpen || state === 'thinking') return;
    void playIdleBehavior('happy');
  };

  const changeSkin = () => {
    const next = skin === 'q' ? 'mature' : 'q';
    setSkin(next);
    localStorage.setItem('dafeiyu.desktop.skin', next);
  };

  const send = async () => {
    const content = text.trim();
    if (!content || state === 'thinking') return;
    behaviorToken.current += 1;
    setText('');
    setState('listening');
    setReply('收到，正在交给 Agent…');
    setBubbleVisible(true);

    try {
      const accepted = await window.dafeiyu.sendMessage({
        clientMessageId: crypto.randomUUID(),
        clientUserId: userId,
        clientConversationId: conversationKey,
        displayName: '主人',
        text: content,
      });
      setConversationId(accepted.conversationId);
      localStorage.setItem(
        'dafeiyu.desktop.internalConversation',
        accepted.conversationId,
      );
      setState('thinking');
      setReply('大肥鱼正在深海里思考…');
      const run = await waitForRun(accepted.runId);
      if (run.status !== 'completed') throw new Error(run.failureMessage || run.status);
      const history = await window.dafeiyu.getMessages(accepted.conversationId);
      setMessages(history);
      const latest = [...history].reverse().find((message) => message.role === 'assistant');
      setReply(latest?.content || '任务完成啦。');
      setState('speaking');
      await waitForMemory(accepted.runId);
      window.setTimeout(() => setState('idle'), 1_800);
    } catch (error) {
      setReply(error instanceof Error ? error.message : '暂时无法连接 Agent。');
      setState('offline');
    }
  };

  return (
    <main
      className={`pet-shell mode-${panelOpen ? 'chat' : 'pet'} state-${state} skin-${skin}`}
      onContextMenu={(event) => {
        event.preventDefault();
        void window.dafeiyu.showContextMenu();
      }}
    >
      <div className="drag-handle" title="拖动大肥鱼">
        <span>{stateLabel(state)}</span>
        <div className="window-actions">
          <button type="button" onClick={changeSkin}>{SKINS[skin === 'q' ? 'mature' : 'q'].label}</button>
          <button type="button" onClick={() => void window.dafeiyu.hideWindow()}>—</button>
        </div>
      </div>

      <button
        type="button"
        className={`speech-bubble ${bubbleVisible && !panelOpen ? '' : 'hidden'}`}
        onClick={() => void setChatOpen(true)}
      >
        {reply}
      </button>

      <button
        type="button"
        className="character"
        aria-label="与大肥鱼互动"
        onClick={interact}
        onDoubleClick={() => void setChatOpen(true)}
      >
        <span className="thinking-ring" aria-hidden="true" />
        <span className="behavior-effect" aria-hidden="true">
          {state === 'sleeping' ? 'Zzz' : state === 'happy' ? '♥' : state === 'wandering' ? '～' : ''}
        </span>
        <img src={SKINS[skin].src} alt={`${SKINS[skin].label}大肥鱼鲸鱼娘`} draggable={false} />
      </button>

      {panelOpen && (
        <section className="chat-card">
          <header>
            <div><strong>大肥鱼</strong><small>Agent 桌宠 · {SKINS[skin].label}</small></div>
            <button type="button" onClick={() => void setChatOpen(false)}>×</button>
          </header>
          <div className="history">
            {messages.slice(-8).map((message) => (
              <p className={message.role} key={message.id}>
                <span>{message.role === 'user' ? '你' : '大肥鱼'}</span>
                {message.content}
              </p>
            ))}
          </div>
          <textarea
            value={text}
            autoFocus
            placeholder="输入消息，Ctrl + Enter 发送"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === 'Enter') void send();
            }}
          />
          <button className="send" type="button" disabled={!text.trim() || state === 'thinking'} onClick={() => void send()}>
            {state === 'thinking' ? '思考中…' : '发送'}
          </button>
        </section>
      )}
    </main>
  );
}

async function waitForRun(runId: string): Promise<AgentRun> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const run = await window.dafeiyu.getRun(runId);
    if (['completed', 'failed', 'cancelled', 'waiting_approval'].includes(run.status)) {
      return run;
    }
    await delay(500);
  }
  throw new Error('Agent 执行超时。');
}

async function waitForMemory(runId: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const memory = await window.dafeiyu.getMemory(runId);
    if (memory.extractionStatus === 'completed' || memory.extractionStatus === 'failed') return;
    await delay(500);
  }
}

function stableUuid(key: string): string {
  const current = localStorage.getItem(key);
  if (current) return current;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

function randomInteger(minimum: number, maximum: number): number {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type IdleBehavior = 'happy' | 'sleeping' | 'wandering';
type PetState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline' | IdleBehavior;

function stateLabel(state: PetState): string {
  return {
    idle: '在线 · 待命',
    listening: '正在接收',
    thinking: 'Agent 思考中',
    speaking: '回复完成',
    offline: '连接异常',
    happy: '心情不错',
    sleeping: '正在打盹',
    wandering: '桌面散步中',
  }[state];
}

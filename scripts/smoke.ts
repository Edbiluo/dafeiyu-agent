const apiUrl = process.env.API_URL ?? 'http://localhost:3100';
const request = {
  clientMessageId: crypto.randomUUID(),
  clientUserId: crypto.randomUUID(),
  clientConversationId: crypto.randomUUID(),
  displayName: 'Smoke Tester',
  text: '记住我正在验证大肥鱼的持久 Agent 链路。',
};

const responses = await Promise.all([sendMessage(request), sendMessage(request)]);
const first = responses.find((response) => !response.duplicate);
const duplicate = responses.find((response) => response.duplicate);
if (!first || !duplicate || duplicate.runId !== first.runId) {
  throw new Error('Concurrent idempotency verification failed.');
}

let run: RunResponse | null = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const response = await fetch(`${apiUrl}/v1/runs/${first.runId}`);
  if (!response.ok) throw new Error(`Run query failed with HTTP ${response.status}.`);
  run = (await response.json()) as RunResponse;
  if (run.status === 'completed') break;
  if (run.status === 'failed' || run.status === 'cancelled') {
    throw new Error(run.failureMessage ?? `Run ended with ${run.status}.`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (run?.status !== 'completed') throw new Error('Agent run did not complete in time.');

const messagesResponse = await fetch(
  `${apiUrl}/v1/conversations/${first.conversationId}/messages`,
);
if (!messagesResponse.ok) {
  throw new Error(`Message query failed with HTTP ${messagesResponse.status}.`);
}
const history = (await messagesResponse.json()) as { messages: unknown[] };
if (history.messages.length < 2) throw new Error('Expected user and assistant messages.');

let memory: { extractionStatus: string | null; memories: unknown[] } | null = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const response = await fetch(`${apiUrl}/v1/runs/${first.runId}/memory`);
  if (!response.ok) throw new Error(`Memory query failed with HTTP ${response.status}.`);
  memory = (await response.json()) as {
    extractionStatus: string | null;
    memories: unknown[];
  };
  if (memory.extractionStatus === 'completed') break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (memory?.extractionStatus !== 'completed' || memory.memories.length < 1) {
  throw new Error('Memory extraction did not complete or persist a node.');
}

console.log(
  JSON.stringify(
    {
      success: true,
      duplicateProtected: true,
      runId: first.runId,
      status: run.status,
      messageCount: history.messages.length,
      memoryExtractionStatus: memory.extractionStatus,
      memoryCount: memory.memories.length,
    },
    null,
    2,
  ),
);

async function sendMessage(body: typeof request): Promise<AcceptedResponse> {
  const response = await fetch(`${apiUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Message submission failed with HTTP ${response.status}.`);
  return (await response.json()) as AcceptedResponse;
}

type AcceptedResponse = {
  duplicate: boolean;
  messageId: string;
  runId: string;
  conversationId: string;
  status: string;
};

type RunResponse = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  failureMessage: string | null;
};

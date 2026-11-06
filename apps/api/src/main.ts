import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';
import {
  acceptedMessageResponseSchema,
  sendMessageRequestSchema,
  uuidSchema,
} from '@dafeiyu/contracts';
import { ConversationService } from '@dafeiyu/conversation';
import { ConsoleTelemetry } from '@dafeiyu/observability';
import {
  createDatabase,
  PostgresConversationIntakeStore,
  PostgresReadModel,
} from '@dafeiyu/persistence';
import { normalizeWebMessage } from '@dafeiyu/platform-adapters';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const databaseUrl = requiredEnv('DATABASE_URL');
const host = process.env.API_HOST?.trim() || '127.0.0.1';
const port = parsePort(process.env.API_PORT);
const webOrigin = process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173';

const database = createDatabase(databaseUrl);
const telemetry = new ConsoleTelemetry();
const service = new ConversationService(
  new PostgresConversationIntakeStore(database),
  telemetry,
);
const readModel = new PostgresReadModel(database);
const app = Fastify({ logger: true, genReqId: () => randomUUID() });

await app.register(cors, { origin: webOrigin });

app.get('/health', async () => {
  await database`SELECT 1`;
  return { status: 'ok' };
});

app.post('/v1/messages', async (request, reply) => {
  const parsed = sendMessageRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'INVALID_REQUEST',
      details: z.treeifyError(parsed.error),
    });
  }

  const result = await service.accept(normalizeWebMessage(parsed.data));
  return reply.code(202).send(
    acceptedMessageResponseSchema.parse({
      accepted: true,
      duplicate: result.duplicate,
      messageId: result.messageId,
      runId: result.runId,
      conversationId: result.conversationId,
      status: result.status,
    }),
  );
});

app.get('/v1/runs/:runId', async (request, reply) => {
  const params = z.object({ runId: uuidSchema }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'INVALID_RUN_ID' });
  const run = await readModel.getRun(params.data.runId);
  if (!run) return reply.code(404).send({ error: 'RUN_NOT_FOUND' });
  return run;
});

app.get('/v1/runs/:runId/memory', async (request, reply) => {
  const params = z.object({ runId: uuidSchema }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'INVALID_RUN_ID' });
  const run = await readModel.getRun(params.data.runId);
  if (!run) return reply.code(404).send({ error: 'RUN_NOT_FOUND' });
  return readModel.getRunMemory(params.data.runId);
});

app.get('/v1/conversations/:conversationId/messages', async (request, reply) => {
  const params = z
    .object({ conversationId: uuidSchema })
    .safeParse(request.params);
  if (!params.success) {
    return reply.code(400).send({ error: 'INVALID_CONVERSATION_ID' });
  }
  return {
    messages: await readModel.listMessages(params.data.conversationId),
  };
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down API');
  await app.close();
  await database.end({ timeout: 5 });
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host, port });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parsePort(value: string | undefined): number {
  const portValue = Number(value ?? 3100);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65_535) {
    throw new Error(`Invalid API_PORT: ${value ?? ''}`);
  }
  return portValue;
}

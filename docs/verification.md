# 里程碑 1 验证记录

验证日期：2026-11-06

## 自动检查

```text
pnpm typecheck  → 14/14 工作区包通过
pnpm test       → 2 个测试文件、6 个测试通过
pnpm build      → Web 生产构建通过
```

## 基础设施

```text
PostgreSQL 16 + pgvector → healthy
Redis 7                  → healthy / PONG
数据库表                  → 13 张
vector extension          → 已启用
```

## 端到端 Smoke Test

验证链路：

```text
Web 规范化消息
→ Fastify API
→ PostgreSQL 原子写入消息、Agent Run、Outbox
→ Outbox Relay
→ Redis / BullMQ
→ Worker
→ LangGraph Runtime
→ Mock ModelGateway
→ 回复持久化
→ 异步记忆提取
→ 记忆来源关联
```

自动测试结果：

```json
{
  "success": true,
  "duplicateProtected": true,
  "status": "completed",
  "messageCount": 2,
  "memoryExtractionStatus": "completed",
  "memoryCount": 1
}
```

额外数据库检查：

- 2 个 Agent Run 均为 `completed`。
- 2 个记忆提取任务均为 `completed`。
- 待发布 Outbox 数量为 0。
- 两个并发提交使用同一个外部事件 ID 时，只创建一个 Agent Run。

## 人工验证

当前本地进程运行时，打开：

```text
http://localhost:5173
```

输入消息后，页面应依次显示：

```text
消息已提交，Agent 正在运行
等待 Worker
Agent 执行中
执行完成
```

当前 `.env` 使用 `MODEL_MODE=mock`，因此不会产生模型费用。切换 DeepSeek 后需重新执行完整 Smoke Test。

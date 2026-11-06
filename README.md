# 大肥鱼 Agent

大肥鱼是一个面向个人与小型团队的多渠道自主 Agent。它将网页、QQ 和未来的直播互动转换为统一事件，通过持久 Agent Run、受控工具、长期记忆和异步 Worker 完成回答与行动。

## 当前可验证里程碑

当前版本提供本地网页纵向链路：

```text
Web UI → Fastify API → PostgreSQL 原子接收 + Outbox
       → Redis / BullMQ → Worker → LangGraph
       → Mock 或 DeepSeek ModelGateway → PostgreSQL 回复
       → 异步记忆提取任务
```

平台事件、模型 SDK、数据库和 LangGraph 均由接口隔离。QQ Adapter 尚未接入。

## 环境要求

- Node.js 24+
- pnpm 12+
- Docker Desktop

## 首次启动

复制 `.env.example` 为 `.env`。仓库已经为本地验证准备了 `MODEL_MODE=mock`，不需要 API Key。

```powershell
pnpm install --registry=https://registry.npmjs.org
pnpm infra:up
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

三个服务命令是持续运行的进程，请分别在三个终端运行。打开：

```text
http://localhost:5173
```

### 启动桌宠

保持 API、Worker、PostgreSQL 和 Redis 运行，在另一个终端执行：

```powershell
pnpm dev:desktop
```

桌宠默认使用 Q 版鲸鱼娘。顶栏按钮可切换到成熟版；点击角色打开对话，右键打开桌宠菜单。角色资产的来源和非商业使用说明见 `apps/desktop/assets/NOTICE.md`。

也可在 API 和 Worker 运行时执行：

```powershell
pnpm smoke
```

该脚本验证消息幂等、异步 Agent Run、回复持久化和历史读取。

## 使用真实 DeepSeek

在 `.env` 中设置：

```dotenv
MODEL_MODE=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=你的密钥
LLM_MODEL=deepseek-chat
```

不要提交 `.env`。

## 质量检查

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## 文档

- [目标架构](docs/architecture.md)
- [架构决策记录](docs/adr/0001-modular-monolith.md)
- [开发路线](docs/roadmap.md)

## 当前限制

- 网页入口仅供本地开发，还没有登录和租户授权。
- 工具调用与人工审批只有领域接口，尚未进入第一个 Runtime 图。
- pgvector 列已经预留，Embedding 和向量索引尚未启用。
- QQ 官方 Webhook、生产 HTTPS、备份和 OpenTelemetry 尚未实现。

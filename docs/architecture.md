# 架构概览

大肥鱼采用模块化单体加独立 Worker 的架构。平台接入只负责验证、标准化和发送消息；核心服务负责编排会话、Agent Run、记忆、工具与审计。

```text
Platform Adapter → Conversation Service → Agent Runtime → Model / Tools / Memory
                         │                         │
                         └──── Postgres / Outbox ───┴──── Redis Worker
```

## 关键边界

- `contracts`：跨模块稳定数据结构与运行状态。
- `conversation`：消息幂等、用户/会话作用域与 Agent Run 创建。
- `agent-core`：规划、工具循环、检查点、暂停和恢复的运行时边界。
- `memory`：原始历史、事件节点、摘要和检索。
- `tools`：Schema、权限、超时、审批和审计。
- `platform-adapters`：QQ、飞书、网页和直播的输入输出适配。
- `observability`：Trace、Metric、Log、成本和评测事件。

生产数据目标为 PostgreSQL + pgvector，异步任务目标为 Redis + BullMQ。SQLite 仅保留为原型与本地开发适配器。

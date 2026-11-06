# 开发路线

## 里程碑 1：可持久运行的 Agent 纵向切片

- [x] 建立 Monorepo、领域包和 ADR。
- [x] 定义版本化消息、Agent Run、队列任务、记忆和工具契约。
- [x] 建立 Fastify API、React 验证台和平台无关 Web Adapter。
- [x] 建立 PostgreSQL + pgvector、Redis 和 Docker Compose。
- [x] 实现原子消息接收、Agent Run、Transactional Outbox 和并发幂等。
- [x] 实现 BullMQ Worker、统一重试上限和终态处理。
- [x] 实现 LangGraph Runtime 与 Mock / DeepSeek ModelGateway。
- [x] 实现异步记忆提取、来源关联和提取任务状态。
- [x] 完成类型检查、单元测试、生产构建和端到端 Smoke Test。

## 桌宠并行里程碑：双形态 Electron 客户端

- [x] 默认使用用户提供的 Q 版鲸鱼娘，成熟版作为可切换皮肤。
- [x] 为两套白底立绘生成透明背景运行资产。
- [x] 建立透明、无边框、置顶、可拖动的 Electron 桌宠窗口。
- [x] 实现托盘、隐藏、退出、右键菜单和单实例保护。
- [x] 通过安全 Preload IPC 连接现有 Agent API。
- [x] 将 listening、thinking、speaking、offline 映射为角色动画。
- [x] 实现桌宠聊天、历史加载和本机皮肤选择持久化。
- [x] 完成 Electron Runtime、类型检查和生产构建验证。
- [ ] 用户完成 Windows 桌面视觉与交互验收。
- [ ] 增加安装包、自动更新和开机启动设置。
- [ ] 分层 Live2D 模型替换单张立绘整体动画。

## 里程碑 2：真正的 Agent 工具闭环

- [ ] 定义 LangGraph 动态路由：回答、规划、工具、审批、结束。
- [ ] 实现 Tool Registry、执行预算、超时、权限和审计。
- [ ] 实现记忆检索工具、时间工具和待办工具。
- [ ] 持久化 Tool Call、Agent Step 和审批请求。
- [ ] 实现 Run Event API 和网页执行轨迹。

## 里程碑 3：生产型记忆和检索

- [ ] 操作级记忆更新、冲突、过期和用户纠错。
- [ ] 每日/每周摘要和未完成事项。
- [ ] PostgreSQL 全文检索、Embedding 和 pgvector 混合检索。
- [ ] 用户、会话、租户作用域的数据库级约束。
- [ ] 记忆查看、导出和删除界面。

## 里程碑 4：QQ 官方机器人

- [ ] QQ Webhook 原始请求验签和验证回调。
- [ ] QQ 事件 Adapter、群白名单、@触发和限流。
- [ ] Outbound Outbox、发送重试和平台消息 ID 回写。
- [ ] HTTPS、域名、服务器部署和真实群聊验证。

## 里程碑 5：可观测、评测与作品化

- [ ] OpenTelemetry Trace、Metric 和结构化日志。
- [ ] 记忆、工具、隔离、恢复和安全评测集。
- [ ] 成本、延迟、错误率和任务状态管理台。
- [ ] 备份恢复演练、部署文档、架构图和演示视频。

## 里程碑 6：直播输出

- [ ] TTS Adapter、音频缓存和播放队列。
- [ ] Live2D 表情、动作白名单和直播电脑桥接。
- [ ] OBS 控制、弹幕 Adapter 和直播调度策略。

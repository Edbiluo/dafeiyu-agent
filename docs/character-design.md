# 大肥鱼双形态角色设计

## 角色选择

桌宠默认使用用户提供的 Q 版鲸鱼娘：

```text
源文件：apps/desktop/assets/鲸鱼娘-DeepSeek-Q版立绘.webp
运行文件：apps/desktop/assets/dafeiyu-q-transparent.png
```

成熟全身版作为可切换皮肤同步保留：

```text
源文件：apps/desktop/assets/dafeiyu-whale-girl.png
运行文件：apps/desktop/assets/dafeiyu-whale-girl-transparent.png
```

`character-manifest.json` 记录默认皮肤与运行资产。桌宠首次启动选择 Q 版，用户可在窗口顶栏切换成熟版，选择保存在本机 `localStorage`。

## 定位

大肥鱼是蓝发鲸鱼娘女仆形象，也是 Agent 的桌面交互载体。角色外观负责陪伴和状态表达；会话、工具、记忆和任务仍由平台无关的 Agent Core 负责。

## 状态映射

| Agent 状态 | 第一版表现 |
|---|---|
| idle | 缓慢漂浮和呼吸 |
| listening | 左右轻摆，提示消息已接收 |
| thinking | 上下浮动并显示旋转思考环 |
| speaking | 轻微缩放律动并显示回复气泡 |
| offline | 降低饱和度和透明度 |
| waiting_approval | 后续增加独立审批动作和提示牌 |

单张立绘不能实现真实眨眼、口型、头发物理和独立摆尾。此类动画需要分层 PSD 或 Live2D 模型；当前整体动画用于先验证 Electron、Agent API 和状态协议。

## 来源与使用边界

角色图片来自[蓝色大肥鱼档案馆](https://fisharchive.cc/)。网站将其描述为非官方 DeepSeek 同人内容，标注 CC BY-NC-SA 4.0 与非商业二创，并列出上善无形和 ZipZipPipe 等来源信息。当前项目按用户要求仅作个人、非商业使用。

详细署名与资产边界见：

```text
apps/desktop/assets/NOTICE.md
```

角色图片及其透明背景技术衍生文件不适用项目代码许可证。若未来公开分发、用于求职作品展示或改为商业用途，需要重新核对原作者当时的授权条件并保留署名。

内容基于公开资料归纳改写，以遵守内容许可要求。

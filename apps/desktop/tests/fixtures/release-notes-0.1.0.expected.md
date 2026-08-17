## 中文

DeepSeek Gestalt 0.1.0 是首个 Desktop Bundle，收录官方上游基线之后的 25 个提交。

### 模型与会话体验

- Models 页面显示每个模型的输入模态，并支持配置 thinking level；已保存的不推理模型会保持明确状态。
- Session 日志下载入口位于 Trajectory 工具栏，导出 slot 与类型也支持独立 Trajectory 组合。

### DeepSeek Gestalt Desktop

- Desktop Host 启动锁定的 `dsh web` Web Host，保留一个窗口内的 Workspace 与 Session 模型，并加入原生窗口 chrome、Launch Directory 和显式 Update Control。
- Desktop Bundle 提供 macOS arm64、macOS x64 与 Windows x64 安装包；macOS 产物签名并公证，Windows NSIS 暂不签名但支持更新。

### 发布可靠性

- 发布流程固定官方 Node 与生产依赖闭包，在对应架构 runner 上 smoke 每个安装包，并核验安装器、blockmap 与更新 feed 的精确集合。
- Windows 快照会实体化 pnpm 文件链接；macOS 签名使用 runner 的文件数硬限制与有界资源遍历；失败或中断的交接会清理本次运行拥有的 draft 和标签。

### Agent 工程工作流

- 仓库加入本地 Agent skill 包、Gestalt GitHub Issue tracker 规则、领域上下文与默认 ticket delivery 编排，供后续变更按 ticket、隔离实现、review 与 CI 流程交付。

### 来源与比较

- 官方上游基线：[`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a)
- 完整比较：[`47f943859bef60e4160492346772ded9b24f765a...gestalt-v0.1.0`](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/compare/47f943859bef60e4160492346772ded9b24f765a...gestalt-v0.1.0)

## English

DeepSeek Gestalt 0.1.0 is the first Desktop Bundle and contains the 25 commits after the official upstream baseline.

### Model and session experience

- The Models page shows each model's input modalities and configures its thinking level while preserving an explicit state for stored non-reasoning models.
- Session log download lives on the Trajectory toolbar, with export slots and types that also support standalone Trajectory compositions.

### DeepSeek Gestalt Desktop

- Desktop Host starts a locked `dsh web` Web Host, preserves the one-window Workspace and Session model, and adds native Window Chrome, a Launch Directory, and an explicit Update Control.
- The Desktop Bundle provides macOS arm64, macOS x64, and Windows x64 installers; macOS artifacts are signed and notarized, while Windows NSIS remains unsigned and update-capable.

### Release reliability

- The release flow pins official Node and the production dependency closure, smokes every installer on a matching runner architecture, and verifies the exact installer, blockmap, and update-feed set.
- Windows snapshots materialize pnpm file links; macOS signing uses the runner's hard open-file limit and a bounded resource walk; failed or interrupted handoffs remove the draft and tag owned by the run.

### Agent engineering workflow

- The repository includes a local Agent skill pack, Gestalt GitHub Issue tracker rules, domain context, and default ticket-delivery orchestration so later changes proceed through tickets, isolated implementation, review, and CI.

### Source and comparison

- Official upstream baseline: [`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a)
- Full comparison: [`47f943859bef60e4160492346772ded9b24f765a...gestalt-v0.1.0`](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/compare/47f943859bef60e4160492346772ded9b24f765a...gestalt-v0.1.0)

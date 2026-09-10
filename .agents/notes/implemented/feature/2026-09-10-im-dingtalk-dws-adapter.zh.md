# 钉钉 DWS 适配器用于 IM 账号接管

[English](2026-09-10-im-dingtalk-dws-adapter.md) | 中文

- Area: `area/session`
- Kind: `kind/feature`
- Issue: #617（#613 子任务）
- Parent: T1 IM 领域配置 (#615), T2 可靠投递与游标 (#616)

## 问题

钉钉上的实时 IM 账号接管需要与本机已安装的钉钉工作台 CLI（`dws`）集成，以便作为已授权的个人真实账号而非群机器人运作：
1. 适配器必须在受管理的子进程中运行事件流消费命令（`dws event consume --format ndjson --ephemeral`）。
2. 入站 NDJSON 事件必须被精确解析并分类为 `external`、`ai_outbound`、`human_native`、`human_dsh` 或 `unknown`，禁止臆测。
3. 消息发送（`dws chat message send` 或 `reply`）必须遵守平台参数约束：引用回复强制要求 `--conversation-id`、`--ref-msg-id` 与 `--ref-sender`，绝不能传入 `--group`。
4. 模糊的出站结果（如超时、进程在确认前被终止）必须收敛为 `result_unknown`，禁止盲目重试以避免重复发送。
5. 所有子进程必须在 Cordis 上下文释放（disposal）时彻底终止，不泄漏孤儿 CLI 进程。

## 方案

实现了 `@deepseek-ai/dsh-im-dingtalk`，在 Cordis 中注册 `ctx.imDingtalk`（`DingTalkDwsAdapterService`）：
- **子进程集成**：通过 `ctx.subprocess.spawn` 启动 `dws event consume`，逐行解析 stdout 的 NDJSON 并录入 `ctx.imDelivery.receiveInbound`。
- **发送者证据判定**：`classifySender` 严格基于账号身份元数据、AI 发送标记及客户端来源属性判定证据。
- **严格出站参数**：`sendMessage` 区分单聊目标（`--user`、`--open-dingtalk-id`）与群聊目标（`--group`）。引用回复使用 `dws chat message reply` 并排除 `--group`。
- **Result-Unknown 防护**：超时及未决退出标记为 `result_unknown`，拒绝自动重试。
- **发送状态收敛**：`querySendStatus` 调用 `dws chat message query-send-status --open-task-id` 并归一化为 `sent`、`failed`、`pending` 或 `unknown`。
- **可靠释放**：注册 effect 清理钩子 `imDingtalk.disposeAll`，在 Context 销毁时终止并等待所有活动子进程。

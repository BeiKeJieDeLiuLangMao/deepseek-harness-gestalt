# Agent Note: 浏览器控制权仲裁

Status: implemented

[English](2026-08-19-browser-control-arbitration.md) | 中文

## 问题

用户可能需要在 Agent 正在驱动的同一个真实标签页上输入、点击、处理验证码或确认登录。如果没有共享修订号和明确的控制权所有者，基于过期观察的 Agent 写入会覆盖人工操作，或丢失 Session、Profile、浏览器实例与标签页。

## 决策

人工指针与键盘输入以及 Agent 命令都针对同一个 Browser Workspace 标签页。可观察的打开与不可用页面状态携带 `controlOwner`（`agent` | `human`）以及后续写入必须匹配的修订号。`input` 记录一次人工写入、递增修订号，并把 `controlOwner` 设为 `human`。`takeover` 在不改变页面内容的情况下把独占控制权交给人。`returnControl` 把独占控制权交回 Agent。接管与交还过程中，Session、Profile、浏览器实例与标签页身份保持不变。

Provider 串行执行每次写入，并以 `BROWSER_REVISION_CONFLICT` 拒绝过期的 `expectedRevision`。被拒绝的 Agent 写入之后，Agent 必须重新 `observe`。Agent 的 `navigate` 与 `focus` 会把 `controlOwner` 设为 `agent`。敏感 Browser 操作继续走现有工具审批与权限路径；本工单不增加第二条审批通道。

`dsh-browser-workspace` 把每个标签页的当前控制权所有者持久化到 Session 的 `browser/workspace` 快照，供后续 Dock UI 在 Session 切换与重新加载后恢复。延迟 Consumer 把 `controlOwner` 渲染进普通工具结果，并新增 `browser_input`、`browser_takeover` 与 `browser_return_control`，不引入第二种工具卡格式。等待、运行、完成与连接丢失事实仍由现有工具结果和 `unavailable` 状态报告。

## 考虑过的替代方案

**不做修订号检查，后写覆盖。** 否决，因为迟到的 Agent 命令会静默覆盖人工登录或验证码答案。

**给人工另开一个浏览器实例或转移页面。** 否决，因为工单要求接管与交还后仍保留完全相同的 Session、Profile、浏览器实例与标签页。

**为 Dock 再加一种工具卡或所有权事件流。** 否决，因为 Dock UI 属于后续工单，现有普通工具结果与 Session Workspace 快照已经携带真实的控制权与可用性事实。

## 后果

人与 Agent 可以共享一个标签页而不丢失身份。过期的 Agent 写入会明确失败，并强制重新观察。Session 快照会持久化当前控制权所有者，供后续 Dock UI 使用。Dock chrome 与发布仍属于后续工单。

## 验证

- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/browser-workspace packages/browser/tool-browser`
- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/browser-workspace packages/browser/tool-browser --coverage --coverage.include='packages/browser/browser-runtime/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-deterministic/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-tandem/src/**/*.ts' --coverage.include='packages/browser/browser-workspace/src/**/*.ts' --coverage.include='packages/browser/tool-browser/src/**/*.ts'`
- `pnpm run test:snapshot -t 'temporary Browser Profile|Tandem Browser Profile'`
- 真实 Tandem e2e 仍由 `DSH_TANDEM_CHECKOUT` 与 `DSH_TANDEM_BIN` 门控；两者都设置时覆盖两种到达顺序。

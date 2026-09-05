# Agent Note: JSON-safe Session queue-edit Remote content

Status: implemented

[English](2026-09-05-session-update-queue-json-safe-edit.md) | 中文

## Problem

`session.updateQueue` 位于 Typert Remote 上，因此每个请求字段都必须在进程边界上 JSON-safe。`QueueAction.edit.content` 先前复用可合并扩展的 `ContentBlock[]`。该联合包含 tool-call、tool-result 以及插件扩展成员，其 JSON Schema 对象携带 unconstrained `unknown`，于是 Host Typert 分析在 `SessionController.updateQueue` 失败，无法发出 `./remote` 产物。queue edit 仍必须拒绝 image 与其他附件准入，不能变成开放内容转储。

## Decision

`QueueAction.edit.content` 使用与 `session.prompt` 相同的 JSON-safe `PromptContentPart[]`。Host 仍在替换 pending inbox occurrence 之前，把每个非 text 部件拒绝为 `session/attachment-invalid`（`QUEUE_EDIT_NON_TEXT`）。被接受的 edit 只把 `{ type: 'text', text }` 块映射进 inbox。Image、tool 与插件内容不进入此 Remote。Workspace `directoryPicker` Remote（`pick`、`list`、`createDirectory`）已使用 JSON-safe listing 类型，并与这份 Session 约定一起生成。

## Alternatives considered

**保留 `ContentBlock[]` 并放宽 Typert 以允许 unconstrained `unknown`。** 否决：生成器的 JSON-safety 检查是进程边界不变量。放宽它会掩盖其他非法 Remote 字段。

**手写 `lib/typert.remote-client.*`。** 否决：生成的 Remote 文件是 Client `ctx.remote` 类型的来源。手改会与 Host 方法漂移。

**删除 edit，只保留 remove/steer。** 否决：Client 已通过 `updateQueue` 编辑 pending 文本；删除该动词会去掉一条现有控制平面操作。

**经 `admitPromptContent` 在 queue edit 上准入 image。** 本切片否决：queue mutation 只对仍 pending 的 occurrence 做文本控制。附件准入仍属于 `session.prompt`。

## Consequences

Typert 可以分析并生成 Session 与 Workspace 的 Host-for-Client Remote，包括 `ctx.remote.directoryPicker`。queue-edit 调用方发送 prompt parts，而不是日志 `ContentBlock`。非文本 edit 仍以既有 attachment-invalid 码失败。Member Question snapshot/settle Remote 仍是后续 #590 切片；此处不删除 ApiProxy。

# Agent Note: JSON-safe Session queue-edit Remote content

Status: implemented

[English](2026-09-05-session-update-queue-json-safe-edit.md) | 中文

## Problem

`session.updateQueue` 位于 Typert Remote 上，因此每个请求字段都必须在进程边界上 JSON-safe。`QueueAction.edit.content` 先前复用可合并扩展的 `ContentBlock[]`。该联合包含 tool-call、tool-result 以及插件扩展成员，其 JSON Schema 对象携带 unconstrained `unknown`，于是 Host Typert 分析在 `SessionController.updateQueue` 失败，无法发出 `./remote` 产物。

Web queue dock 只编辑纯文本行。pending inbox occurrence 仍可能同时包含文本与 Host 已授权的 `ImageAttachmentRef`。以 prompt 的 `PromptContentPart[]` 替换内容，要么会丢失这些引用，要么会通过第二条附件准入路径接受原始字节。queue edit 必须保留已授权图片，且不能信任调用方提供的引用元数据。

## Decision

`QueueAction.edit.content` 是封闭的 JSON-safe `QueueEditContentPart` 联合：`{ type: 'text'; text: string }` 与 `{ type: 'image'; attachment: ImageAttachmentRef }`。Host 复制文本，并针对精确的 pending occurrence 解析每个提交的图片 id，然后写回该 occurrence 的权威引用。调用方提供的媒体类型、字节数、尺寸和名称不会替换已存值。未知 id 以 `QUEUE_EDIT_ATTACHMENT_NOT_REFERENCED` 失败；遗漏任何现有图片以 `QUEUE_EDIT_ATTACHMENT_OMITTED` 失败。两者都使用 `session/attachment-invalid`，并保持 occurrence 不变。原始 prompt 图片字节、tool block 与插件 block 不在生成的 Remote 类型中，会在操作前被 wire 校验拒绝。

## Alternatives considered

**保留 `ContentBlock[]` 并放宽 Typert 以允许 unconstrained `unknown`。** 否决：生成器的 JSON-safety 检查是进程边界不变量。放宽它会掩盖其他非法 Remote 字段。

**手写 `lib/typert.remote-client.*`。** 否决：生成的 Remote 文件是 Client `ctx.remote` 类型的来源。手改会与 Host 方法漂移。

**复用 `PromptContentPart[]`。** 否决：其图片成员携带供 `session.prompt` 准入的原始 base64，不能标识 pending item 中已授权的图片。

**删除 edit，只保留 remove/steer。** 否决：Client 已通过 `updateQueue` 编辑 pending 文本；删除该动词会去掉一条现有控制平面操作。

**经 `admitPromptContent` 在 queue edit 上准入新图片。** 否决：queue mutation 不是附件准入操作。新图片仍由 `session.prompt` 准入。

## Consequences

Typert 可以分析并生成 Session 与 Workspace 的 Host-for-Client Remote，包括 `ctx.remote.directoryPicker`。queue-edit 调用方可以按 id 保留图片并改写文本，但不能修改已授权引用或准入新图片。Web queue dock 仍只编辑纯文本行，并保持混合行不可编辑。

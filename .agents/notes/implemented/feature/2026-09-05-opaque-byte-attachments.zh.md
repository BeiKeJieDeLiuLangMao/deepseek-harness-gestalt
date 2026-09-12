# Agent Note: Opaque byte attachments share the image object store

Status: implemented

[English](2026-09-05-opaque-byte-attachments.md) | 中文

## Problem

加密 Companion 准入需要在只写入日志的 `session/attachment-admitted` 事件之前，把精确的通用文件字节持久化到 Host。附件 seam 当时只存储规范化图片：`ImageAttachmentRef`、`saveImage` 和 `readImage`。恢复 `FileAttachmentRef` 别名会掩盖图片与不透明文件元数据不同、且从不共享 `ImageBlock` 这一事实。

## Decision

`AttachmentStore` 现在把不透明文件作为第二条公开路径。`saveBytes` 与 `readBytes` 使用 `ByteAttachmentRef`（`attachmentId`、声明的 `mediaType`、`bytes`、小写十六进制 `sha256`、可选的剥离后 `name`）。本地存储把这些精确字节发布进现有的 `<DSH_HOME>/attachments/v1/objects/<prefix>/<sha256>` 树，复用图片路径的暂存、排他硬链接、fsync 以及失败暂存清理。相同字节仍共享一个对象。写入时大小由 `Config.maxByteBytes` 约束（默认 100 MiB）。空载荷、非法媒体类型以及剥离后为空的名字会在发布任何对象之前被拒绝。读取会重新校验摘要与记录长度；它们不会解码光栅，也不会套用当前写入上限。不持久化不透明文件的提供方保留默认的 `ATTACHMENT_BYTES_UNSUPPORTED` 拒绝。不透明字节绝不会变成模型可见的 `ImageBlock`。Session Controller 的 Remote 准入与 `operationId` 幂等仍属于后续 Host 切片。

## Alternatives considered

**恢复 `FileAttachmentRef` / `saveFile`。** 历史名称会让图片引用和文件引用看起来可互换，并重新引入本 seam 已不再拥有的兼容别名。

**为文件再建一套数据库或对象根。** Companion 文件与图片已经共享内容寻址字节和持久性证明；平行存储只会重复 fsync 与清理，而不会改变公开类型。

**只做图片 Remote 准入。** Desktop Companion 提交的是任意解密文件。把 Host 存储限制为 `saveImage` 会丢掉这条路径。

## Consequences

本地测试在临时 `DSH_HOME` 下持久化 PDF 与纯文本字节，证明空/超限/非法名字会清理暂存，并在之后收紧上限后仍能重读。图片准入保持不变。Host 的 `session.admitAttachment` 仍需在后续变更中调用 `saveBytes`；本切片不追加会话事件，也不把字节发给模型。

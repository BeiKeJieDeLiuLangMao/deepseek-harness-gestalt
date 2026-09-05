# Agent Note: Session Controller admits Companion opaque files

Status: implemented

[English](2026-09-05-session-admit-attachment-remote.md) | 中文

## Problem

Desktop Companion 已经用精确解密后的文件字节调用 `session.admitAttachment`。附件 seam 可以把这些字节持久化为 `ByteAttachmentRef`，但 Gestalt Session Controller Host Remote 还没有准入方法。把调用留在 ApiProxy 会继续引用已不存在的 `FileAttachmentRef` / `saveFile`；做成只收图片的 Remote 则会丢掉通用 Companion 文件。

## Decision

`SessionController` 通过 `SessionAttachmentAdmission` 拥有 `session.admitAttachment`。该方法会恢复普通 Session，然后复用 `ApiSessionAgentController.serializeImageAdmission`，使同一 Session 上的并发 `operationId` 在 live Agent/Session 提交点串行。链持有后扫描 Session 日志中的该 `operationId`：`sha256` / bytes / mediaType / name（name 经附件 seam 的 `displayName` 规范化后再比较）匹配则返回已记录的 `ByteAttachmentRef`；不匹配则以 `ATTACHMENT_OPERATION_COLLISION` 失败且不追加。首次准入调用 `saveBytes`，追加可忽略的 `session/attachment-admitted`（`source: 'companion'`），再 `sessions.flush`。内存中已记录的准入在 flush 完成前不报告成功，因此之后用同一 `operationId` 重试会把持久化做完。线路边界与历史 Companion schema 一致（operation id ≤ 128、media type ≤ 127、name ≤ 255、最多 100 MiB 的规范 base64）。不透明文件绝不会变成 `ImageBlock` 或 prompt 文本。`session.attachment` 仍是图片读取。Desktop 仍使用名称 `session.admitAttachment`；把 Desktop 调用方从 ApiProxy 换走属于后续接线。

## Alternatives considered

**在 Agent controller 之外再做一套按 Session 的平行账本。** 碰撞检查与追加会和 live 日志竞态。现有准入链已经为该 Agent 串行图片 prompt 准入。

**只用 `saveImage`。** Companion 提交的是任意解密文件，包括 PDF 与文本。

**恢复 `FileAttachmentRef`。** 字节 seam 已经发布 `ByteAttachmentRef`；别名会掩盖图片与文件的区分。

## Consequences

Host 测试用真实本地对象和 JSONL 日志覆盖路径名重试、碰撞、超限载荷、并发相同 operation，以及可忽略事件重开。成功在 `sessions.flush` settle 之前不会返回，包括已追加 `operationId` 的后续重试；重开后与那一条已记录事件一致。生成的 Host 与 Client Remote codec 覆盖有界请求、非法名字和 subagent 拒绝。在 Desktop 改接之前，ApiProxy 仍包含旧方法。事件载荷的 persistence-catalog 再生要等该所有权迁移完成。

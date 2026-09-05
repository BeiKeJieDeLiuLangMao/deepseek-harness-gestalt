# Agent Note: Better Sidebar 0.18.0 源码刷新且不恢复平行 Side Chat

Status: implemented

[English](2026-09-06-better-sidebar-0-18-source-refresh.md) | 中文

## 问题

快照仍钉在 Better Sidebar 0.16.1（`f9153dfc`）。0.18.0（`f59ffd07`）带来 split-sidebar、locale chunk、changes/diff 以及 `remote.session.openWorkspacePath`，但也会恢复本仓已退役的页内 transcript/轮询 Side Chat，而本仓改用 canonical `conversation` 挂载。

## 决策

只从 `f9153dfc` 到 `f59ffd07` 导入 `dsh.plugin.json`、`src` 和 `tsdown.config.ts`。不导入 `src/client/sidechat-transcript.ts`。保留 canonical Side Chat 标签：临时身份、`uiRenderer.mountSession(..., 'conversation', ...)`、首次提交才发布 Host、restore/close，以及现有 admission adapter 对象。采用 `src/client/chunks/locale.tsx`，并把 `locale` 加入 `CHUNKS` / `CHUNK_NAMES`，使 Host 提供 `lib/client-locale.js`。重放 LOCAL-MODIFICATIONS 每一行，并在该文件记录保留、迁移、采用或退役。

`SessionAdmissionAdapter` 仍 type-import `@deepseek-ai/dsh-client-runtime/client`。ClientSessions 尚未注册或分发完整 adapter（handles、owned-suffix 历史、临时 start 与已发布 prompt、cancel、queue、permission、modelRoute）。与其发明空 interface 或兼容 barrel，不如把该路由标为未完成。源码导入可以落地；组装后的 Side Chat 在该 owner 存在之前不予验收。

## 考虑过的替代方案

**整份采用 0.18 Side Chat 视图，含 transcript 轮询和 history 菜单。** 不采用，因为那会恢复平行渲染器并丢掉已批准的 Conversation 挂载。

**在快照里声明空的 `SessionAdmissionAdapter`，好让 Typert 与快照编译。** 不采用，因为 optional chaining 已经在未注册时静默跳过；空类型会掩盖缺失的 ClientSessions 分发。

**等 #589/#591 GitHub 合并后再导入源码。** 本隔离 worktree 不采用：允许的源码钉可以先落地，那些契约仍列为未完成。

## 后果

快照钉为 0.18.0 / `f59ffd07`。split-sidebar、locale chunk 与 LOCAL chrome 仍在。平行 Side Chat transcript 仍不存在。admission 路由仍是已记录的未完成依赖。

## 验证

聚焦检查：无 `sidechat-transcript` 路径；`CHUNKS` 含 `locale`；`SideChatView` 仍对 `conversation` 调用 `mountSession`；LOCAL-MODIFICATIONS 列出全部 24 行处置；`dsh.plugin.json` 版本为 `0.18.0`。本切片不声称包测试、Typert catalog 或组装级 Web/Electron 证据。

# @deepseek-ai/dsh-browser-workspace

[English](README.md) | 中文

这是 Session 持有的 Browser Workspace binder。`ctx.browserWorkspace` 把 Browser Runtime 身份绑定到一条 Session 日志，使每个 Session 独立拥有零个或多个 Workspace、实例与标签页。

## 服务 API

`create`、`navigate`、`observe`、`screenshot`、`focus` 与 `close` 都要求提供所属 `Session`。缺少 Session 所有权会以 `BROWSER_SESSION_MISMATCH` 拒绝。已被另一个 live Session 拥有的 target 会以 `BROWSER_TRANSFER_UNSUPPORTED` 拒绝。`create` 附加到另一 live Session 的 Workspace 或实例也会以 `BROWSER_TRANSFER_UNSUPPORTED` 拒绝，附加到本 Session 未知的层级则以 `BROWSER_SESSION_MISMATCH` 拒绝。`setDock` 把 Dock 是否打开以及首选宽度记录为 Session 事实。`snapshot` 与 `foldBrowserWorkspace` 返回最后记录的完整 Workspace；在首次变更前返回空 Workspace。`cleanup` 会关闭遗留的 live Runtime 标签页、从 Session 快照中遗忘它们，并作为 `session/disposed` 返回的工作。

`browser/workspace` 是仅日志、后写覆盖的 `SessionEventMap` 成员。当组合挂载 `ctx.sessionProjections` 时，本包注册 `browserWorkspace` 投影单元。不支持跨 Session 页面转移。

## 模型体验

当调用 Agent Session 存在时，通过 dsh-tool-browser 间接影响模型。Binder 自身不增加模型 token。

#### KV 缓存影响

已记录的 Workspace 快照不进入派生模型历史。

## 已知限制与后续工作

- Dock UI 与人工接管仍属于后续工作。本包只持久化 Dock 打开状态与宽度事实。
- 无密钥 Browser Runtime 快照只组合 Runtime 与 Consumer。Session 隔离由 Binder 持有，这些不含 Binder 的轨迹不宣称该隔离。

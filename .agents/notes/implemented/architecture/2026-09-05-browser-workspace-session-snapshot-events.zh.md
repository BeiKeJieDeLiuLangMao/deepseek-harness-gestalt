# Agent Note: Browser Workspace reads Session snapshots and writes ignorable workspace events

Status: implemented

[English](2026-09-05-browser-workspace-session-snapshot-events.md) | 中文

## 问题

Browser Workspace 曾从 Typert 诊断拒绝的实时 `Session.events` 数组重建 Session 持有的标签页，并且最终 `browser/workspace` 追加省略了 `ignorable: true`。未挂载 Binder 的读取方会把该事件当作读取必需。

## 决定

Binder 折叠 `Session.snapshotEvents()` 得到后写覆盖的 Workspace，包含 fork 继承前缀。这是原有的 Session 持有后写覆盖规则：子 Session 在写入自己的快照之前，从完整日志重建继承的 Workspace。本切片不改 `assertOwned`。fork 后父会话与子会话都会折叠该 Workspace，因此每个 live Session 把对方视为 owner，Runtime 动词拒绝该共享 target。fork 后的独占 live Runtime 授权是独立的所有权缺口。`foldBrowserWorkspace` 的可选 `end` 仍是所供事件数组的排他下标，不是 `SessionSeq`。最终 `session.append('browser/workspace', snapshot, { ignorable: true })` 把仅日志事件标记为未知类型读取方可跳过。不变式伴生校验每条 `snapshotEvents()` 记录，并继续忽略无关类型，包括未挂载伴生时的未知可忽略事件。

## 曾考虑的替代方案

**恢复兼容的 `Session.events` getter。** 否决，因为 Typert 诊断就是要阻止实时数组读取；getter 会掩盖同一缺陷。

**为本包关闭 Typert 诊断。** 否决，因为默认生成路径必须保持真实检查。

**在 `snapshot()` 中只折叠 `ownEvents()`。** 否决，因为 Browser Workspace 对整条 Session 日志后写覆盖，包含 fork 继承前缀。Schedule 的子会话自有切分是另一条产品规则。

**让 `browser/workspace` 保持读取必需。** 否决，因为省略 Workspace 快照不得拒绝重建不依赖 Browser 标签页的 Session。

## 影响

未知类型读取方可跳过 Browser Workspace 快照。挂载 Binder 的读取方仍从冻结 snapshot API 折叠后写覆盖状态。fork 后的 Session 通过 `snapshot(child)` 重建继承的 Workspace 所有权。该重建之后父会话的 live Runtime 授权仍是独立缺陷：`assertOwned` 会遍历每个其它 live Session 的 snapshot。

# Agent Note: Desktop Companion 通过 `$events` 结算 Host waterfall

Status: implemented

[English](2026-09-06-desktop-companion-remote-events.md) | 中文

## 问题

Companion 的 Ask User 与 Approval 结算走 `/api/respond` 和 mux `rpcId`。Gateway Client 事件用 `eventId` 加上 `$events` generation 的 `clientId` 标识 waterfall，结果经 `$events/result` 回传 `next`、`result` 或 `rejected`。两套身份不能互换。已完成或被替换的结果是 Gateway no-op，不是 Host `not-pending`。

## 决策

Desktop Host RPC 在 `/api/remote.mux` 上跟随 `$events`，使用官方 ready 与 downlink 解析器，并通过与其他 Host 方法相同的认证一元通道提交 `$events/result`。Companion 登记表在当前 `clientId` 下按 `eventId` 保存等待。配对私有 interaction id 仍由 HMAC 派生。过期等待在本地以 `not-pending` 失败，不伪造 Host 回执。Ask User 回答为 `{ answers }`；取消为 `UserQuestionError` / `ASK_CANCELLED`。Approval 结果为 `allowed-once` 与 `rejected`。Host 重启与 `$events` abort 清空 pending。配对 ledger 仍拥有 mutation 重试。Session Controller 的 `api-session/added` 与 `api-session/removed` emit 使 Companion surface 失效，下次投影再拉 `session/list`。`api-session/status`、`api-session/activity` 与 `api-session/error` 使该 Session 行失效。Workspace follow increment 与活动 Session follow append 只作脏信号。活动 `session/follow` event 经 `liveProjection.changed` 使该 Session 失效，下次 `projectLiveSession` 替换含 conversation 增量，包括 Assistant chunk 与消息。取消 live projection 后该 Session 的后续 conversation 回调停止。workspace follow upsert 使 Companion surface 失效。Desktop 不再打开 `/api/events.mux` 或 `/api/events.host`。Companion 列表、创建、搜索、图片读取与不透明文件准入使用生成的 `session/list`、`session/create`、`session/search`、`session/attachment` 与 `session/admitAttachment`。图片读取与文件准入保持在这两条独立 Remote 上。

## 备选方案

**继续用 `/api/respond` 和 mux `rpcId` 做 Companion 结算。** 否决：Gateway 没有 `session.respond` Remote，且 `rpcId` 不是 `eventId`。

**把 Gateway 已完成事件的 no-op 当成 Host `not-pending`。** 否决：那会伪造 Gateway 并未发出的 Host 回执。

## 后果

Renderer 与 Companion 可以同时收到同一 waterfall。第一个声称它的 `$events/result` 继续 Host；后续结果 no-op。Approval 结算把结果字符串 `allowed-once` 或 `rejected` 作为 waterfall result 回传，而不是 Ask User 的 `{ answers }` 对象。同一配对操作的后续 Companion 重试由 ledger 去重；针对已取消等待的另一操作在本地以 `not-pending` 失败。

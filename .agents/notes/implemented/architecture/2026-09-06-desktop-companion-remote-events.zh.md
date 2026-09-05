# Agent Note: Desktop Companion 通过 `$events` 结算 Host waterfall

Status: implemented

[English](2026-09-06-desktop-companion-remote-events.md) | 中文

## 问题

Companion 的 Ask User 与 Approval 结算走 `/api/respond` 和 mux `rpcId`。Gateway Client 事件用 `eventId` 加上 `$events` generation 的 `clientId` 标识 waterfall，结果经 `$events/result` 回传 `next`、`result` 或 `rejected`。两套身份不能互换。已完成或被替换的结果是 Gateway no-op，不是 Host `not-pending`。

## 决策

Desktop Host RPC 在 `/api/remote.mux` 上跟随 `$events`，使用官方 ready 与 downlink 解析器，并通过与其他 Host 方法相同的认证一元通道提交 `$events/result`。Companion 登记表在当前 `clientId` 下按 `eventId` 保存等待。配对私有 interaction id 仍由 HMAC 派生。过期等待在本地以 `not-pending` 失败，不伪造 Host 回执。Ask User 回答为 `{ answers }`；取消为 `UserQuestionError` / `ASK_CANCELLED`。Approval 结果为 `allowed-once` 与 `rejected`。Host 重启与 `$events` abort 清空 pending。配对 ledger 仍拥有 mutation 重试。

## 备选方案

**继续用 `/api/respond` 和 mux `rpcId` 做 Companion 结算。** 否决：Gateway 没有 `session.respond` Remote，且 `rpcId` 不是 `eventId`。

**把 Gateway 已完成事件的 no-op 当成 Host `not-pending`。** 否决：那会伪造 Gateway 并未发出的 Host 回执。

## 后果

Renderer 与 Companion 可以同时收到同一 waterfall。第一个声称它的 `$events/result` 继续 Host；后续结果 no-op。Approval 结算把结果字符串 `allowed-once` 或 `rejected` 作为 waterfall result 回传，而不是 Ask User 的 `{ answers }` 对象。同一配对操作的后续 Companion 重试由 ledger 去重；针对已取消等待的另一操作在本地以 `not-pending` 失败。

# Agent Note: Desktop Companion settles Host waterfalls through `$events`

Status: implemented

English | [中文](2026-09-06-desktop-companion-remote-events.zh.md)

## Problem

Companion Ask User and Approval settlement used `/api/respond` and mux `rpcId`. Gateway Client events identify a waterfall with `eventId` plus the `$events` generation `clientId`, and results go to `$events/result` as `next`, `result`, or `rejected`. Those identities are not interchangeable. A completed or replaced result is a Gateway no-op, not Host `not-pending`.

## Decision

Desktop Host RPC follows `$events` on `/api/remote.mux` with the official ready and downlink parsers, and posts `$events/result` through the same authenticated unary carrier as other Host methods. The Companion registry keys pending waits by `eventId` under the current `clientId`. Pairing-private interaction ids stay HMAC-derived. Expired waits fail locally as `not-pending` without inventing a Host receipt. Ask User answers are `{ answers }`; cancel is `UserQuestionError` / `ASK_CANCELLED`. Approval outcomes are `allowed-once` and `rejected`. Host restart and `$events` abort clear pending. The pairing ledger still owns mutation retry. Session Controller `api-session/added` and `api-session/removed` emits invalidate the Companion surface so the next projection refetches `session/list`. `api-session/status`, `api-session/activity`, and `api-session/error` invalidate that Session row. Workspace follow increments and active Session follow appends are dirty signals only. An active `session/follow` event invalidates that Session through `liveProjection.changed`; the next `projectLiveSession` replacement includes the conversation increment. A workspace follow upsert invalidates the Companion surface. Desktop no longer opens `/api/events.mux` or `/api/events.host`. Companion list, create, search, image read, and opaque-file admission use generated `session/list`, `session/create`, `session/search`, `session/attachment`, and `session/admitAttachment`. Image reads and file admissions stay on those separate remotes.

## Alternatives considered

**Keep `/api/respond` and mux `rpcId` as Companion settlement.** Rejected because Gateway does not expose a `session.respond` Remote, and `rpcId` is not `eventId`.

**Treat a Gateway completed-event no-op as Host `not-pending`.** Rejected because that forges a Host receipt the Gateway does not emit.

## Consequences

Renderer and Companion can both receive the same waterfall. The first `$events/result` that claims it continues the Host; later results no-op. Approval settlement posts the outcome string `allowed-once` or `rejected` as the waterfall result, not an Ask User `{ answers }` object. A later Companion retry of the same pairing operation is ledger-deduped; a different operation against a cancelled wait fails locally as `not-pending`.

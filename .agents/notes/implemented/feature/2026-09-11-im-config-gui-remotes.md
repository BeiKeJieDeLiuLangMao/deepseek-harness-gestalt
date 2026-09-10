# Agent Note: IM config GUI remotes

Status: implemented

English | [中文](2026-09-11-im-config-gui-remotes.zh.md)

## Problem

Official Host now mounts idle IM services, but the Web GUI still mutates an in-memory prototype snapshot. Accounts, takeover rules, and simulation targets therefore cannot persist across reload, and Settings / workspace cards cannot bind `ctx.remote.imConfig`.

## Decision

`ImConfigService` extends `TypertRemoteService` and exposes account, route, and simulation CRUD through `@Remote`. Wire option types live on `@deepseek-ai/dsh-im-core/client`. `packages/api/remotes` mounts the generated contribution. `ui-im` injects `remote` and `remote.imConfig`, then refreshes its snapshot from Host lists. The GUI Remote `listRouteRules` is an unfiltered adapter because an optional positional argument cannot ride the wire. New GUI routes stay disabled; editing a rule reuses `createRouteRule` with the same id so target and trigger can change. Disconnect marks the account `disconnected` and does not delete it. Conversation stream presentation later moved to `imDelivery` remotes; see [IM delivery GUI remotes](2026-09-11-im-delivery-gui-remotes.md).

## Alternatives considered

**Keep the prototype store as the product GUI.** Rejected because Host already owns durable accounts and routes; a second in-memory source of truth would drift.

**Add `imDelivery` remotes in the same change.** Rejected because the conversation tab still has no live inbound/outbound Host methods; shipping config remotes first unblocks Settings and workspace cards without claiming live delivery.

**Delete the account on GUI disconnect.** Rejected because the prototype disconnect only flips connectedness; deleting would drop routes and simulation bindings.

## Consequences

Web GUI account, route, and simulation mutations persist through Host remotes when the Client assembly is mounted. Secrets still never enter the snapshot. Live DingTalk consume, live Wangwang reads, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.

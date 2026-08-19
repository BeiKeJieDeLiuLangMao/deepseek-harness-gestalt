# Agent Note: Content-free Companion push and foreground deep links

Status: implemented

English | [中文](2026-08-19-content-free-companion-push.zh.md)

## Problem

A backgrounded Mobile Companion cannot notice a pending approval, human question, completed turn, or failure without a wake signal. A push provider that receives Session text, interaction arguments, or device identity becomes another privileged reader. A notification action that settles an interaction from stale chrome can mutate Desktop state the user has not seen.

## Decision

Content-free push is a Remote Access concern, not a separate Platform notification bus. `@deepseek-ai/dsh-remote-protocol` owns the hint record, category vocabulary, wire parser, and APNs/FCM projections. A hint carries only `approval` | `question` | `turn-complete` | `failure`, a branded `routeId`, and an optional opaque `sessionRef`. `companionPushHintForEvent` returns `undefined` for streaming, so a streaming chunk cannot fan out. Parsers reject extra fields.

`@deepseek-ai/dsh-remote-access` owns token persistence and fan-out inside `PersonalPairingProvider`. A Mobile Installation may register a token only after it owns that route. Desktop publish is limited to the Installation's current route. Individual revocation deletes that Installation's tokens; Mobile Access disable deletes every token of the revoked routes. APNs and FCM adapters project the protocol payload through an injected transport and do not enrich it. Development composes `MemoryPushTokenStore` and `KeylessCompanionPushDelivery`.

`apps/mobile` `companion-push.ts` owns process visibility. Backgrounding closes the WSS flag and clears synchronization. A notification tap returns `foreground` → `reconnect` → `synchronize` → `present` and never sets `settle: true`, so notification chrome cannot call `settleCompanionInteraction` with acceptance.

The daily 500-hint quota stays on the open-registration admission counter. Pairing HTTP routes, native APNs/FCM credentials, and real-device TestFlight/APK proof remain outside this decision.

This implements the push slice of the [Mobile Companion proposal](../../proposed/feature/2026-08-17-mobile-companion.md) without splitting pairing, Relay, blobs, and push into shallow services.

## Alternatives considered

**Ship `@deepseek-ai/dsh-remote-push` as `ctx.remotePush`.** The abandoned WIP started this package. It would make Push Hint a generic Platform bus and split one Remote Access lifecycle. Protocol codecs stay in `remote-protocol`; token fan-out stays inside `remote-access`.

**Put vendor payload builders only in `apps/mobile`.** Platform must emit APNs/FCM bodies without Session content. Protocol projections are the shared bound both adapters and tests use.

**Settle approvals from notification actions.** Stale chrome can target work that has already changed. Foreground reconnect and Desktop-authoritative sync precede every mutation.

**Keep a background WSS or silent sync.** Constrained mobile background execution is unreliable, and Expo Push Service is out of scope. Content-free wake plus foreground resynchronization is the accepted path.

## Consequences

Keyless tests pin payload bounds, streaming non-emission, account-isolated token deletion, APNs/FCM adapters against transport doubles, and the Mobile sync-before-present rule. Native vendor credentials, HTTP token routes, persistent PostgreSQL token storage, and device-level APNs/FCM remain named coverage gaps.

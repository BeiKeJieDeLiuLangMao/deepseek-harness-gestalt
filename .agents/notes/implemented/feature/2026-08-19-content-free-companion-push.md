# Agent Note: Content-free Companion push and foreground deep links

Status: implemented

English | [中文](2026-08-19-content-free-companion-push.zh.md)

## Problem

A backgrounded Mobile Companion cannot notice a pending approval, human question, completed turn, or failure without a wake signal. A push provider that receives Session text, interaction arguments, or device identity becomes another privileged reader. A notification action that settles an interaction from stale chrome can mutate Desktop state the user has not seen.

## Decision

Content-free push is a Remote Access concern, not a separate Platform notification bus. `@deepseek-ai/dsh-remote-protocol` owns the hint record, category vocabulary, wire parser, and APNs/FCM projections. A hint carries only `approval` | `question` | `turn-complete` | `failure`, a branded `routeId`, and an optional opaque `sessionRef`. Token and `sessionRef` ceilings are UTF-8 byte limits. `companionPushHintForEvent` returns `undefined` for streaming. Parsers reject extra fields.

`@deepseek-ai/dsh-remote-access` owns token persistence and fan-out on `RemoteAccessService`. `registerPushToken` and `publishPushHint` re-parse at the provider entry, so an extra-field hint never reaches the outbox or a vendor payload. `DesktopCompanionPushPublisher` is an adapter Desktop must call after a durable pending or terminal commit; streaming is discarded at that event layer. Individual revocation deletes tokens by Account and Installation even when the Desktop route is already gone. Mobile Access disable still deletes every token of the revoked routes.

`apps/mobile` owns process visibility. `CompanionForegroundRuntime` is the sole Relay `start()`/`stop()` owner: pairing and visibility share one transition queue, background calls `stop()`, and foreground `start()` records `socketOpen` only after `isConnected()`. Mobile `onCiphertext` after Desktop-authoritative resync calls `synchronize()`. `settleCompanionInteraction` is the single settlement entry and requires `companionMayMutate` (foreground + socket-open + synchronized). Notification chrome cannot satisfy that gate. Product `unpair()` clears the local token, calls `configure(undefined)`, resets `socketOpen`/`synchronized`, and calls `unregisterPushToken` when a route exists.

The daily 500-hint quota stays on the open-registration admission counter. Pairing HTTP Consumer publish and register routes, native APNs/FCM credentials, and real-device TestFlight/APK proof remain outside this decision. The HTTP client already sends `unregister-push-token`; the Platform register and publish routes remain deferred, and Desktop does not yet listen for session events to call `DesktopCompanionPushPublisher`.

This implements the push slice of the [Mobile Companion proposal](../../proposed/feature/2026-08-17-mobile-companion.md) without splitting pairing, Relay, blobs, and push into shallow services.

## Alternatives considered

**Ship `@deepseek-ai/dsh-remote-push` as `ctx.remotePush`.** The abandoned WIP started this package. It would make Push Hint a generic Platform bus and split one Remote Access lifecycle. Protocol codecs stay in `remote-protocol`; token fan-out stays inside `remote-access`.

**Put vendor payload builders only in `apps/mobile`.** Platform must emit APNs/FCM bodies without Session content. Protocol projections are the shared bound both adapters and tests use.

**Settle approvals from notification actions.** Stale chrome can target work that has already changed. The settlement function itself requires foreground reconnect and Desktop-authoritative sync.

**Keep a background WSS or silent sync.** Constrained mobile background execution is unreliable, and Expo Push Service is out of scope. Content-free wake plus foreground resynchronization is the accepted path.

**Treat helper return types as the settlement gate.** A pinned `settle: false` on the deep-link helper is not enforcement. The product settlement entry reads process state.

## Consequences

Keyless tests pin payload byte bounds, streaming non-emission, provider-entry allowlisting, commit-before-publish, account-and-installation token deletion without a live route, product unpair cleanup including grant clear, serialized Relay start/stop, Desktop-resync `synchronize()` through the Mobile entry `onCiphertext` path, APNs/FCM adapters against transport doubles, real Mobile entry visibility stopping the Relay lifecycle, and settlement refusal before sync. Native vendor credentials, HTTP register/publish routes, the Desktop session-event listener for `DesktopCompanionPushPublisher`, persistent PostgreSQL token storage, and device-level APNs/FCM remain named coverage gaps.

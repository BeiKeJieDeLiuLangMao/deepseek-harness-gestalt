# Agent Note: Companion preserves durable assistant interruption

Status: proposed

English | [中文](2026-09-08-companion-interrupted-assistant-marker.zh.md)

## Problem

A cancelled assistant response retains its delivered prefix in the Session, but Mobile Companion cannot show the existing stopped marker when Desktop omits `interrupted` from the assistant Conversation Node. [Issue #628](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/628) records the observed failure within [#608](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/608).

## Proposal

The Desktop Host-history JSON parser accepts `assistant/message.data.interrupted` only when absent or literal `true`. It forwards literal `true` unchanged into assistant nodes for paged history and live Session replacements; absence remains absence. The [cancelled-prefix decision](../../implemented/architecture/2026-08-10-cancelled-stream-prefix-finalize.md) owns durable interruption, the [live projection decision](../../implemented/architecture/2026-08-24-companion-live-session-projection.md) owns authoritative replacements, and the [shared presentation decision](../../implemented/architecture/2026-08-22-shared-mobile-web-presentation.md) owns rendering. These decisions remain active and are not superseded.

## Accepted visual reference

The reference is the existing `AssistantMarkdown` stopped label and shared Mobile presentation at source revision `6dd74fadaa297d1045db6877a0e156574399bee5`: [renderer](../../../../packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx), [adapter](../../../../packages/client/ui-conversation/src/presentation.tsx), and [Mobile validator](../../../../apps/mobile/src/companion-projection.ts). This scope restores that accepted component and its localized `Stopped` / `已停止` text. It introduces no new layout or UX prototype.

## Experience route

1. Start with the currently paired Android and iOS installations and their retained cancelled Sessions, then reconnect both to the fixed isolated Desktop under the same isolated state. Root coordinates that instance handoff after concurrent iOS testing finishes.
2. On each platform, open its retained Session and refresh authoritative history without another model call. Its retained assistant prefix displays the existing stopped marker beneath the message content.
3. On at least one platform, in a run-owned Session, request bounded real-model streaming output using the already authorized isolated configuration. Cancel after visible text arrives. The prefix remains, the stopped marker appears, and the composer accepts another prompt.
4. Leave and reopen the Session. An authoritative refresh preserves the same prefix and marker. Match the existing component's text and placement, and capture the required real-flow GIF from the reviewed fixed revision.

## Alternatives considered

**Infer interruption from turn completion.** Rejected because the Session message already owns this fact; a turn-level inference could mark a different assistant response and duplicate cancellation semantics in consumers.

**Add a Mobile-specific stopped component.** Rejected because the shared renderer already handles the marker. The defect is in the Desktop producer, before Mobile validates or renders the node.

## Acceptance criteria

Producer tests prove literal-true preservation and invalid-value rejection through paged and live history. An assembled regression carries a real Session interrupted assistant event through Host, Snow, and `MobileCompanionSurface`. The built Mobile product-entry snapshot asserts both locale labels at phone width. Desktop and Mobile README obligations accompany implementation. Focused tests, documentation gates, review, native route evidence, GIF, CI, user acceptance, and retro precede master merge.

## Risks

Invalid Host values fail at the JSON boundary instead of being silently omitted. No dependency, protocol version, cache format, cancellation durability, or release-gate change is intended. Preserve app installations, Personal Pairings, and cached content during native revalidation. This scope does not authorize production changes, signing, publication, or release; release evidence must bind the new exact candidate revision.

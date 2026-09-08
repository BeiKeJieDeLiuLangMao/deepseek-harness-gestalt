# Agent Note: Companion preserves durable assistant interruption

Status: implemented

English | [中文](2026-09-08-companion-interrupted-assistant-marker.zh.md)

## Problem

A cancelled assistant response retains its delivered prefix in the Session, but Mobile Companion cannot show the existing stopped marker when Desktop omits `interrupted` from the assistant Conversation Node. [Issue #628](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/628) records the observed failure.

## Decision

The Desktop Host-history JSON parser accepts `assistant/message.data.interrupted` only when absent or literal `true`. It forwards literal `true` unchanged into assistant nodes for paged history and live Session replacements; absence remains absence. The [cancelled-prefix decision](../architecture/2026-08-10-cancelled-stream-prefix-finalize.md) owns durable interruption, the [live projection decision](../architecture/2026-08-24-companion-live-session-projection.md) owns authoritative replacements, and the [shared presentation decision](../architecture/2026-08-22-shared-mobile-web-presentation.md) owns rendering.

## Alternatives considered

**Infer interruption from turn completion.** Rejected because the Session message already owns this fact; a turn-level inference could mark a different assistant response and duplicate cancellation semantics in consumers.

**Add a Mobile-specific stopped component.** Rejected because the shared renderer already handles the marker. The defect is in the Desktop producer, before Mobile validates or renders the node.

## Consequences

Paged history and live replacement preserve the same durable interruption marker. Invalid Host values fail at the JSON boundary instead of being silently omitted. The existing Companion node field and shared `AssistantMarkdown` presentation require no protocol version, cache migration, dependency, or cancellation-durability change.

## Verification

Desktop producer tests cover literal-true preservation, invalid-value rejection, and absence even when the turn is aborted. Assembled tests carry real Session messages through Host and Snow into `MobileCompanionSurface`, including a live partial-to-interrupted replacement without a history request. The built Mobile product-entry snapshot asserts `Stopped` and `已停止` through the shared renderer at phone width. Native acceptance requires one bounded real-model cancellation in a run-owned Session on an isolated Desktop, then opening that same Session on Android and iOS and verifying the marker after leaving and reopening. It copies no normal user Sessions and retains its generated Session until user review is complete. These checks do not replace candidate-bound release evidence.

# Agent Note: Session Schedule current-state board

Status: implemented

English | [中文](2026-08-17-session-schedule-board.zh.md)

## Problem

Durable Session-local reminders existed only as model tools and later conversation output. A user could not see retained reminders alongside other Session activity or suspend one without deleting and recreating it. Rendering tool history would expose calls rather than current state, lose changes outside the visible transcript, and incorrectly treat a fork's inherited prefix as the child's active work.

Human management must preserve the existing delivery meaning: an ordinary follow-up remains the only reminder output, while a task board describes current scheduling state rather than delivery success. Pause and resume must survive restart and serialize with due dispatch, not live only in browser memory.

## Decision

Version 1 `schedule/change` adds strict id-only `pause` and `resume` transitions. Pause retains the record and target but excludes it from runtime delivery; resume makes the unchanged target active, so an already-past target becomes overdue. Delete accepts active or paused records. `schedule_list` returns retained paused records with `state: 'paused'`; pause and resume remain human-only Remote methods and are not model-facing tools.

The `ctx.schedules` Service owns `schedules/pause`, `schedules/resume`, and `schedules/delete`. Their wire identity is a branded `SessionId`, so a human mutation does not invoke the generic Agent-resume lookup. One Service-owned, per-Session FIFO serializes human mutations with tool management and due delivery; teardown closes admission and awaits accepted transactions, and separate Contexts own separate queues. An existing live root uses its ordinary preflight flush, append, post-append flush, and runtime recomputation. A cold Session is reserved through `sessionPersistence.prepare`, entered without announcement, flushed before its fold is read, mutated and flushed, then detached without publishing Session or Agent lifecycle or starting delivery. The generic `session/detached` edge retires persistence and projection-cache state for announced and unannounced entries, so this path does not retain the Session or need a synthetic public lifecycle. If preparation or entry loses to Agent publication, the transaction recomputes and uses that exact live root inside the same FIFO. The Session log remains the only durable authority, so pause and resume survive restart without another store.

Schedule contributes an independent `schedules` Session projection containing retained records in creation order plus the durable `paused` flag. The projection declares `eventScope: 'owned-suffix'`; the projection registry and cache start it at `SessionHeader.seedLength` in eager, lazy, restore, and replay paths. Clients receive finished current values and never fold Schedule events or reconstruct state from tool calls or conversation output. The Client clock alone derives scheduled versus overdue presentation from `scheduledAt`.

The Web app bundle includes an A-variant Session-header action at order 30, immediately after background jobs. It activates only when the Host mounts the Schedule Remote contribution and stays absent for an empty projection. The trigger count includes scheduled plus overdue records and excludes paused records. Its board retains creation order, shows scheduled, overdue, and paused rows, and provides pause, resume, and delete. Delete requires a second inline confirmation. There is no create form; creation remains model-facing through `schedule_create`.

The board is not a delivery receipt. Reminder assistant output still arrives only as an ordinary later conversation turn under the [conversational delivery decision](../simplification/2026-08-09-conversational-schedule-delivery.md). The board says what Schedule currently retains and whether delivery is suspended, never whether a model answer succeeded or a user read it. This partially extends the [durable Schedule decision](2026-08-05-durable-web-schedule.md) without changing its Session-local delivery boundary.

## Alternatives considered

**Render Schedule tool calls in the transcript.** Calls are historical commands rather than current state. They omit runtime dispatches, Remote mutations, cold restoration, and projection ownership, and would make inherited fork history look active.

**Keep pause in Client state.** A browser-only flag would disappear on reload, race the live timer owner, and permit dispatch while the UI claimed suspension.

**Add model-facing pause and resume tools.** The requested control is human management. Adding tools would enlarge model agency and schemas without being needed for a visible durable board; models can still list and delete reminders.

**Add a browser creation form.** This would duplicate the model's natural-language interpretation and the explicit absolute-time input surface. The first board intentionally manages existing reminders only.

**Treat the board as a durable delivery receipt.** Dispatch records queue admission, not model completion, display, or acknowledgement. A receipt needs a separate downstream acknowledgement protocol and would contradict ordinary conversational delivery.

**Reuse the background-job registry.** Jobs are process-local execution records with different restart, ownership, status, and output semantics. Schedule is Session-log state and must remain durable while its live timer is disposable.

## Verification

Schedule domain and restart tests cover valid and invalid pause/resume transitions, paused deletion, listing paused records, runtime exclusion, persistence uncertainty, cold flush-before-fold, preparation and entry races with a live owner, no public lifecycle during a cold mutation, and a full JSONL Host remount before resumed delivery. Transaction tests prove per-Session ordering, independent owner isolation, closed admission, and quiescent disposal. Projection-cache tests prove unannounced and ordinary announced detachments immediately checkpoint once and retire interval work. Detached Host history proves `SessionHeader.seedLength` reaches cold restore; Schedule projection tests reject malformed changes and invalid transitions instead of publishing a partial value. Plugin lifecycle coverage proves the Schedule projection contribution leaves with its owning fiber. Typert and Client tests cover Remote mounting, combined header ordering after background jobs, active count, state rows, pause/resume, inline delete confirmation, and lifecycle cleanup.

A keyless assembled Desktop browser scenario boots the real Web bundle over HTTP from a durable-only Session fixture. It proves the board comes from the projection, pauses through the generated Remote without removing or disabling the current conversation, remains paused after reload, resumes, deletes through the inline second confirmation, and matches the committed accessibility snapshot.

## Consequences

- Users can inspect and durably suspend Session-local reminders without adding a scheduler database or delivery channel.
- Human and model management share one durable log and serialization point, while pause and resume do not expand model agency.
- Forked Sessions keep inherited conversation history without inheriting active Schedule state in their projection.
- The Client bundle gains one Schedule-specific current-state renderer and Remote dependency; hosts without the Schedule namespace do not activate it.
- A resumed overdue reminder is eligible for ordinary delivery as soon as its live root Agent recomputes.
- The board deliberately cannot create reminders and cannot claim model completion, acknowledgement, or external notification.

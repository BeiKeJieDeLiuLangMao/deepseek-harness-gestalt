# Agent Note: Session Schedule current-state board

Status: implemented

English | [中文](2026-08-17-session-schedule-board.zh.md)

## Problem

Durable Session-local reminders existed only as model tools and later conversation output. A user could not see retained reminders alongside other Session activity or suspend one without deleting and recreating it. Rendering tool history would expose calls rather than current state, lose changes outside the visible transcript, and incorrectly treat a fork's inherited prefix as the child's active work.

Human management must preserve the existing delivery meaning: an ordinary follow-up remains the only reminder output, while a task board describes current scheduling state rather than delivery success. Pause and resume must survive restart and serialize with due dispatch, not live only in browser memory.

## Decision

Version 1 `schedule/change` adds strict id-only `pause` and `resume` transitions. Pause retains the record and target but excludes it from runtime delivery; resume makes the unchanged target active, so an already-past target becomes overdue. Delete accepts active or paused records. `schedule_list` returns retained paused records with `state: 'paused'`; pause and resume remain human-only Remote methods and are not model-facing tools.

The shipped Schedule plugin installs its three model-facing management tools and `ScheduleRuntime` only in scopes owned by live root Agents observed through `agent/created`. One plugin-owned, per-Session FIFO serializes tool management with due delivery; teardown stops runtime admission and awaits accepted transactions, and separate Contexts own separate queues. Every read or decision uses the live Agent's Session. `schedule_create`, `schedule_list`, and `schedule_delete` await `ctx.sessions.flush(session)` before folding `session.ownEvents()`; create and an actual delete append `schedule/change` and await a second flush before reporting durable success. Runtime delivery uses the same preflight flush, appends dispatch after follow-up admission, and awaits a post-append flush before recomputing. Schedule does not acquire a separate Session persistence handle. The Session log remains the only durable authority, so retained changes survive restart without another store.

Schedule contributes an independent Session projection keyed `schedule` containing retained records in creation order plus the durable `paused` flag. `init` stores `Session.inheritedEventCount`; `apply` skips `schedule/change` events whose `seq` is below that cut. The Host definition has no `eventScope` field. Clients receive finished current values and never fold Schedule events or reconstruct state from tool calls or conversation output. The Client clock alone derives scheduled versus overdue presentation from `scheduledAt`.

The Web app bundle includes an A-variant Session-header action at order 30, immediately after background jobs. It activates only when the Host mounts the Schedule Remote contribution and stays absent for an empty projection. The trigger count includes scheduled plus overdue records and excludes paused records. Its board retains creation order, shows scheduled, overdue, and paused rows, and provides pause, resume, and delete. Delete requires a second inline confirmation. There is no create form; creation remains model-facing through `schedule_create`.

The board is not a delivery receipt. Reminder assistant output still arrives only as an ordinary later conversation turn under the [conversational delivery decision](../../archived/simplification/2026-08-09-conversational-schedule-delivery.md). The board says what Schedule currently retains and whether delivery is suspended, never whether a model answer succeeded or a user read it. This partially extends the [durable Schedule decision](2026-08-05-durable-web-schedule.md) without changing its Session-local delivery boundary.

## Alternatives considered

**Render Schedule tool calls in the transcript.** Calls are historical commands rather than current state. They omit runtime dispatches, Remote mutations, cold restoration, and projection ownership, and would make inherited fork history look active.

**Keep pause in Client state.** A browser-only flag would disappear on reload, race the live timer owner, and permit dispatch while the UI claimed suspension.

**Add model-facing pause and resume tools.** The requested control is human management. Adding tools would enlarge model agency and schemas without being needed for a visible durable board; models can still list and delete reminders.

**Add a browser creation form.** This would duplicate the model's natural-language interpretation and the explicit absolute-time input surface. The first board intentionally manages existing reminders only.

**Treat the board as a durable delivery receipt.** Dispatch records queue admission, not model completion, display, or acknowledgement. A receipt needs a separate downstream acknowledgement protocol and would contradict ordinary conversational delivery.

**Reuse the background-job registry.** Jobs are process-local execution records with different restart, ownership, status, and output semantics. Schedule is Session-log state and must remain durable while its live timer is disposable.

## Verification

Schedule domain, tools, runtime, and restart tests cover valid and invalid pause/resume transitions, paused deletion, listing paused records, runtime exclusion of paused overdue work, persistence uncertainty, JSONL remount of overdue delivery, and Include/Loader create-pause-list-delete. Transaction tests prove per-Session ordering, independent owner isolation, closed admission, and quiescent disposal. Schedule projection tests reject malformed changes, invalid transitions, and checkpoint indexes whose decoded records disagree. Plugin lifecycle coverage proves the Schedule projection contribution leaves with its owning fiber. Human Remote transport and the Desktop board remain a retained design obligation and are not mounted; Typert, Client, and assembled Desktop board scenarios are not current Host evidence.

## Consequences

- Users can inspect and durably suspend Session-local reminders without adding a scheduler database or delivery channel.
- Human and model management share one durable log and serialization point, while pause and resume do not expand model agency.
- Forked Sessions keep inherited conversation history without inheriting active Schedule state in their projection.
- The Client bundle gains one Schedule-specific current-state renderer and Remote dependency; hosts without the Schedule namespace do not activate it.
- A resumed overdue reminder is eligible for ordinary delivery as soon as its live root Agent recomputes.
- The board deliberately cannot create reminders and cannot claim model completion, acknowledgement, or external notification.

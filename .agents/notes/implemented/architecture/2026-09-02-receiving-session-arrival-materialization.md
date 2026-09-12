# Agent Note: receiving Session materialization at Member Question arrival

Status: implemented

English | [中文](2026-09-02-receiving-session-arrival-materialization.zh.md)

## Problem

A routed Member Question needs a real local conversation in the invitation-bound Workspace: the member talks with their own agent about the Decision Brief before and after answering, and a normal local answer must not leave a permanent answered strip. T6 kept Host Session creation behind the first explicit human turn so arrival spent no model tokens. That left the sidebar row ungrouped, delayed replayable brief context until a prompt, and kept the ordinary prompt route unavailable until `admitHumanTurn` succeeded.

## Decision

Authenticated arrival materializes exactly one Host Session for the `(originSessionId, receiving Account)` route key. The Host receiver still owns the opaque `ReceivingSessionId`. After committing the question row, `ingest` calls one injected Session materializer with the invitation-time Workspace binding and every retained question on that thread. `SessionController` optionally injects `memberQuestionReceiver`. While that service is absent the controller stays active and does not register a materializer; when the service appears, including after HMR, the inject callback installs the unique materializer, human-turn admitter, and terminal Session sync as that fiber's disposer. The installer reuses the receiver id as the Host `SessionId`, attaches the bound Workspace, titles the Session from the first brief origin line, appends ignorable `member-question/received` and any already-canonical `member-question/settled` records, injects each bounded brief with a stable plugin message id, and flushes persistence. A failed arrival flush leaves the receiver `materialized` flag false so replay retries the same identity. A later durable terminal resumes that already-materialized Session and appends ignorable `member-question/settled` once; a failed flush retries after `receivingTerminalRetryMs`. Unloading the controller cancels timers, refuses stale writes, waits for in-flight syncs, and withdraws the registration. Injection stages model-visible context without waking the driver, so arrival request count remains 0. Human-turn admission is registered on the same inject fiber: it resumes the already-materialized Session, marks `source.kind=user` with the reserved rpcId, and steers or follows up. An unmaterialized identity is refused instead of creating a second Session. Generated Remote `memberQuestion.admitHumanTurn` promotes encoded browser uploads through the Host attachment store, then calls the same receiver reservation. Wire payloads cannot cite attachment refs. Generated `memberQuestion.snapshot` and `memberQuestion.settle` already own Client reads and settlement. Remaining ApiProxy member-question methods are `workspaceBinding`, `ensureWorkspaceBinding`, and `bindWorkspace`, plus leftover snapshot/settle RPC wrappers that are not the production owner.

AgentLoop owns the Session persistence write handle: creation acquires it before Agent publication, and cold resume opens the existing Session for writing. The materializer records and flushes through that owner; it never acquires a second writer. Persistence remains optional at composition time. Mounting a backend after an in-memory Agent exists does not retroactively acquire a writer for that Agent.

Idempotent replay and Host restart resume an unmaterialized row through `resumeReservedSessionMaterializations()` without creating a second Session. Human turns remain a separate reserved `admitHumanTurn` path. Once `hostSessionId` is present, the receiving face binds the ordinary Host Session and routes later prompts through `session.prompt`; a local answer still settles through `memberQuestion.settle`. The Client projects local `answered` terminals out of the conversation footer and keeps exceptional or cross-install terminals as record bands. The sidebar lists the Host-attached Session under the bound Workspace; the browser expands that Workspace once on a newly pending identity without changing the current Session.

The [Host receiver ledger](2026-08-31-host-owned-member-question-receiver-ledger.md) still owns persistence, first claim, expiry, and human-turn reservation. The [identity-stable receiving face](../feature/2026-08-30-web-receiving-experience-assembly-fixes.md) still owns pending waits and Host-snapshot projection. The [Files-sidebar opening note](2026-09-03-member-question-files-sidebar.md) owns transferred document cache paths and Better Sidebar Files opening.

## Supersession check

This note supersedes the T6 alternative that rejected Host Session creation at arrival. Arrival remains a collaboration notification for model spend: the Session exists so the member can talk, but the local agent still runs only after an explicit human prompt.

## Alternatives considered

**Keep Host Session creation behind the first human turn.** Rejected because the member cannot talk about the brief before answering, the row stays Ungrouped, and replayable context is missing until a prompt.

**Wake the local agent on arrival.** Rejected because arrival must not spend model tokens. `agent.inject()` stages the brief for the next human turn without opening one.

**Expose `session.create` then `prompt` to the Client.** Rejected because a crash between those calls can duplicate Sessions or lose the first human message. Arrival uses one materializer; human turns keep one reserved `rpcId`.

**Leave local answers as permanent conversation footer bands.** Rejected because a normal local answer is the member's completed decision, not an exceptional terminal. Expired, withdrawn, superseded, and answered-elsewhere outcomes still need a durable record.

## Consequences

A routed question appears as an ordinary Host Session under the invitation-bound Workspace as soon as the Host accepts it. The Decision Brief is logged and injected before any human prompt. The member can send ordinary prompts before answering and again after a local answer. Arrival itself does not start a model turn. Local answers leave the conversation footer; exceptional or cross-install terminals remain as record bands.

## Testing

Focused receiver tests pin arrival materialization, idempotent replay, interrupted-materializer resume, and unchanged human-turn reservation. Session Controller Host tests pin authenticated ingest onto a real AgentLoop Agent: JSONL reopen of the same id, one ignorable `member-question/received`, one Decision Brief `agent/inbox/spliced` inject, idle status with zero model requests, transferred-document cache isolation, one ignorable settled event after receiver terminal commit, failed-flush retry without a duplicate settled event, Host-restart replay of durable terminals, arrival flush failure leaving `materialized` false until retry, refusal to create an unmaterialized Session, and materializer disposer rollback. Backend call audits pin one create on first arrival and none on retries or cold resume, alongside JSONL reopen after Loader restart and terminal settlement. A Loader composition boots AgentLoop as the factory from `cordis.yml` (`receivingTerminalRetryMs: 20`) and pins the same brief inject, idle no-wake, JSONL identity, terminal settle, production-timer flush retry, one real `receiver.admitHumanTurn` AgentLoop turn with idempotent rpcId replay, refusal of an unknown receiving Session, one owned ingest-human-turn-model-response-terminal path, and Loader-entry dispose that withdraws the unique admitter. Client Runtime tests pin Host-id projection, local-answer footer omission, and answered-elsewhere bands. Keyless Web assembled coverage and the owning snapshot still expect Workspace grouping, injected brief-before-human context, pre-answer conversation, and post-answer conversation without an arrival model request; those suites currently still call ApiProxy `sessions.create`/`prompt`/`admitHumanTurn` and are not yet rewritten onto Session Controller plus generated receiver Remote.

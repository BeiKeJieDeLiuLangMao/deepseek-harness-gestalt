---
description: "Host and Client session control: create, resume, prompt, follow history, and project live session state."
kind: "package-reference"
---
# Session Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-session-controller` owns the Host `ctx.sessionController` service and the generated Client `session`, `skills`, and `fileReferences` Remote namespaces. It serves Session lifecycle and history, the Host-generation model catalog, workspace-path opening, user-invocable skill discovery, and the adapter for Agent-scoped file references. Use it through API Gateway when a Client needs operations addressed by a Session.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

History pages and follow opening snapshots carry a discriminated `SessionHistoryRecord`. Both variants use `{ type, event }`: `type: 'event'` carries one raw `SessionWireEvent`, while `type: 'chunks'` carries one lossless `ChunkRowEvent` for consecutive same-block `assistant/chunk` deltas. Both inner values expose `type`, `seq`, `time`, and `data`, so the Client retains each accepted record as one `SessionEventLikeEntry` without record-by-record conversion. A packed event's `seq` and `time` identify its first member, and `data` retains the fragment and timestamp-gap arrays. Live follow frames remain individual `event` records. Tool arguments, result content, failures, and `tool/result.data.meta` pass through unchanged; the controller does not resolve a Tool definition, run a presenter, or attach UI data.

Each endpoint states its activation policy. List, search, attachment, history pages, log following, skill discovery, and workspace-path opening can inspect persistence without activating an Agent; `canOpenWorkspacePath()` reports native-opening availability without addressing a Session. `session.admitAttachment` resumes the ordinary Session, serializes concurrent Companion `operationId`s on the existing Agent admission chain, persists exact opaque bytes, appends ignorable `session/attachment-admitted`, and flushes; identical retries — including Windows and POSIX path names that share one leaf — return the recorded reference after flush completes, and colliding payloads fail without a second event. Those files never enter model history. Queue mutation and cancellation require live state. `session.updateQueue` edit content is the JSON-safe `PromptContentPart` list used by prompt; image parts fail as `session/attachment-invalid` and never admit attachments. Model, rename, prompt, and file-reference operations may resolve or resume an ordinary Session. Create and fork are the only operations that create a new Agent directly. `session.fork` keeps `inheritedEventCount` at the source prefix length and passes that prefix through `clearGoalFromForkSeed` before publication, so a trailing clear tombstone is child-owned, the source goal is unchanged, and the child does not auto-arm. The skill catalog instead uses a live Agent when present or the recorded preset's standing scope when cold, so listing never starts an Agent.

The Client adapter exposes `SessionEventStream`, a Gateway `RemoteJournalStream` bound to one ordinary or direct-subagent address. It opens follow before the initial page, publishes only contiguous `replace`, `prepend`, and `append` changes, and repairs reconnect or sequence gaps through a tail page. Backwards paging has two verbs: `loadOlder()` pulls one 50-message page, and `loadThrough(seq)` — the turn-jump loader — loops 200-message pages until the window covers the target seq, lowering a shared target on repeated calls, stopping on a page that makes no progress, and reporting busy through the same `loadingOlder` snapshot bit. Ordinary records cover `[event.seq, event.seq]`; packed rows cover `[event.seq, event.seq + memberCount - 1]`. A business, persistence, or unresolved continuity failure terminates the stream, while only physical carrier loss selects automatic resumption. `SessionControlStream` is a Gateway `RemoteSnapshotStream`; every generation opens with a complete process-local baseline, so reconnect replaces queue, jobs, and projection state instead of treating transient values as durable events.

`ctx.sessions.registerAdmission(sessionId, route)` and `registerAdmissionAdapter(adapter)` install feature-owned Client routes for exact Session identities or matching adapters. Late registration, replacement, and revocation apply immediately to existing `Session` bindings because each Session resolves the live owner at prompt, cancel, queue mutation, and command time. Exact identities outrank adapters; the default conflict strategy replaces the prior exact owner, while `conflict: 'reject'` throws. An outdated disposer does not revoke a newer owner. A hit that fails or throws never falls through to stock Host Remote endpoints, including `subagents.prompt` and `subagents.interruptByParent` for a catalog-addressed child, and a command never becomes a prompt. Unmatched Sessions keep stock Remotes, including those subagent routes when no admission owns the child. Registration does not grant Host authority; titles and ordinary subagent addresses are not credentials. `modelRoute` serves Host `session.modelCatalog` and `session.selectModel` for ordinary listed Sessions. Catalog-addressed and `origin: 'subagent'` identities stay hidden unless a feature `modelRoute` opens them; Host `session.selectModel` refuses those identities (`session/agent-busy`) and this Client does not retarget the parent. An admission that owns `modelRoute` replaces stock, including an explicit undefined hide; omitting the field is not a hide. `commandCatalogSessionId` and `skillCatalogSessionId` remain lookup-only display helpers. `ui-commands` and `ui-skill` list through those identities; execute stays on the composer Session. `historyScope: 'owned-suffix'` trims the Client event window using Host follow `header.seedLength` (`inheritedEventCount`). A later `session/end-seed` does not raise that floor; the durable log is unchanged. `ui-better-sidebar` registers the Side Chat adapter on `registerAdmissionAdapter` for draft and known Side Chat ids.

The Client apply waits for generated `remote.session` (mounted in the same Client Remote `$mount` pass, after `memberQuestion`) and registers `ctx.receivingQuestions` as a Cordis service. That book loads `memberQuestion.snapshot`, settles through `memberQuestion.settle`, and unloads with the fiber. A missing `memberQuestion` property after that mount fails apply immediately; it does not park forever or skip receiving projection.

`ctx.sessions.binding(id)` remains a render-safe lookup: it never opens Host history or refreshes a catalog. `stageProvisional()` inserts one caller-supplied renderer-only Session identity into the ordinary list and binding cache without changing `list.current`. A Host list refresh keeps that unpublished row, and a Host baseline that already lists the id publishes it in place while preserving the same binding. `openForRender()` is the explicit-render Host I/O — it skips history while the identity remains provisional, opens history plus the subagent catalog after Host publication without selecting it, and no-ops for an unknown identity. Duplicate staging of the same identity fails loud. Host publication upgrades the same identity and `SessionBinding` in place; the stage disposer then no-ops so it cannot remove the published Session. Release of an unpublished identity removes its row and Agent scope exactly once, including before the first successful Host list baseline. The renderer consumes only `UiSession.adapter.resolve(sessionId)` and does not own this lifecycle.

The Session object also carries local submission echoes: `session.beginSubmission` inserts one into `SessionSnapshot.pendingSubmissions` synchronously, before the caller serializes and prompts, so a conversation UI can show the message on the submit click's own frame. Session derives each echo's `transcript`, `queued`, or `steering` placement from its current running state and the requested delivery mode, then retains that placement while serialization is in flight. The prompt's `requestId` is the correlation identity: the Host echoes it as the durable user source's `rpcId`, and queue occurrences project it as `SessionQueuedItem.rpcId`. An echo retires one animation frame after its durable event or queue occurrence is observed (the delay keeps it renderable until the replacement is ready), immediately when its identified prompt fails or is abandoned, and as failed on disposal; each retirement fires the registered `onRetire` callback exactly once. Echoes are Client memory only; reload and reconnect rebuild the conversation from durable events alone.

-----

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `coldBlankProbeMaxEvents` | `16` | Maximum stat-reported event count of a cold Session eligible for blankness verification; `0` disables the event-count gate |
| `coldBlankProbeMaxBytes` | `1,024` | Maximum stat-reported artifact byte size of a cold Session eligible for blankness verification when the backend offers no event count; `0` disables the byte-size gate |
| `nativeOpen` | platform-detected | Whether Session workspace paths can be handed to a native desktop opener |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-session-controller) is the exhaustive source for accepted fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as invoked Agent commands own any model-visible effect.

#### KV Cache effect

No direct effect; model requests remain owned by the Agent and LLM packages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Control baselines represent process-local state and therefore cannot reconstruct jobs after a Host restart.
- A failed follow resumption remains visible to the caller instead of retrying indefinitely.
- File-reference completion uses the shared Agent lookup and can resume a cold Session; the `skills/list` catalog is the non-activating alternative for skill metadata.
- Client admission registry dispatch covers prompt, cancel, queue mutation, and command on exact identities and adapters, including blocking stock subagent prompt and interrupt routes on a hit. `modelRoute` uses the stock Host catalog for ordinary Sessions; catalog children stay hidden until a feature route opens them. Omitting `modelRoute` is not a hide. `commandCatalogSessionId` and `skillCatalogSessionId` are lookup-only display helpers consumed by `ui-commands` and `ui-skill`. `historyScope: 'owned-suffix'` trims the displayed window from Host `seedLength`; a later `session/end-seed` does not raise that floor. `ui-better-sidebar` registers the Side Chat adapter.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Every page and frame is checked against the addressed durable Session.

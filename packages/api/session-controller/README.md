---
description: "Host and Client session control: create, resume, prompt, follow history, and project live session state."
kind: "package-reference"
---
# Session Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-session-controller` owns the Host `ctx.sessionController` service and the generated Client `session`, `skills`, and `fileReferences` Remote namespaces. It serves Session lifecycle and history, the Host-generation model catalog, workspace-path opening, user-invocable skill discovery, and Agent-scoped file references. Use it through API Gateway when a Client needs operations addressed by a Session.

## Table of Contents

- [Use this package](#use-this-package)
- [Session media references](#session-media-references)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

History pages and follow opening snapshots carry one `{ type: 'event', event: SessionWireEvent }` record per durable Session event. The Client retains each accepted record as one durable `SessionEventLikeEntry`; Assistant token boundaries remain inside the compact stream on `assistant/message` or `assistant/attempt`. Tool arguments, result content, failures, and `tool/result.data.meta` pass through unchanged; the controller does not resolve a Tool definition, run a presenter, or attach UI data.

Each endpoint states its activation policy. List, search, attachment, history pages, log following, skill discovery, and workspace-path opening can inspect persistence without activating an Agent; `canOpenWorkspacePath()` reports native-opening availability without addressing a Session. `session.admitAttachment` resumes the ordinary Session, serializes concurrent Companion `operationId`s on the existing Agent admission chain, persists exact opaque bytes, appends ignorable `session/attachment-admitted`, and flushes; identical retries — including Windows and POSIX path names that share one leaf — return the recorded reference after flush completes, and colliding payloads fail without a second event. Those files never enter model history. Queue mutation and cancellation require live state. `session.updateQueue` accepts JSON-safe `QueueEditContentPart`: text plus image refs from that pending occurrence. It copies text and resolves each submitted image id back to the occurrence's next exact ref; unknown ids or any per-id occurrence-count change fail as `session/attachment-invalid`, while prompt image bytes remain outside the Remote type. Queue edit never admits attachments. The Web queue dock still edits text-only rows, so mixed rows remain non-editable. `session.toolEligibility` resumes the ordinary Session, reads `ctx.tools.eligibilityAllow` from that Agent context, and returns the same `catalogSchemas` union used by model request assembly: omitted `allow` means no allow-only policy, `[]` means the composition allows no end tool, and a nonempty list is the configured union. Model, rename, prompt, and file-reference operations may resolve or resume an ordinary Session. Create and fork are the only operations that create a new Agent directly. `session.fork` keeps `inheritedEventCount` at the source prefix length. Unpublished setup clears an inherited goal after the child-owned seed marker and before preset composition, so the source goal is unchanged and the child does not auto-arm. The skill catalog instead uses a live Agent when present or the recorded preset's standing scope when cold, so listing never starts an Agent.

The Client journal validates exact V3 event envelopes before publishing follow snapshots, live entries, or history pages. It reuses the browser-safe Session validators for required surface markers, exact replacement endpoints, earlier unique source seqs, embedded Assistant provenance, request-header omissions, and tool-error consistency. Invalid records fail without field stripping or normalization; range membership and source existence remain durable-log checks on the Host.

Each endpoint states its activation policy. List reads only stored headers and projection-cache rows: it never calls per-session stat or opens a cold Session body. A current-format cache identity may supply every list hint; a lifecycle-matching predecessor cache may supply only its version-compatible title as a stale display fact, never as an authoritative fold seed. Search, attachment, history pages, log following, skill discovery, and workspace-path opening can inspect persistence without activating an Agent; `canOpenWorkspacePath()` reports native-opening availability without addressing a Session. Queue mutation and cancellation require live state; model, rename, prompt, and file-reference operations may resolve or resume an ordinary Session. Prompt rejects content with neither non-whitespace text nor an attachment before resolving the Agent or appending Session events; queue edits accept only non-empty text content. Prompt admission consumes opaque receipts from the injected [`fileUploads`](../../client/file-upload/README.md) Host service and resolves every same-Agent receipt before sending the complete ordered content list through `ctx.attachments`. Prompt retries whose `requestId` is already queued or logged return the original acceptance without inserting another message. Create and fork are the only operations that create a new Agent directly. The service applies one preset-aware resume policy and subagent ownership fence to its own methods and to the Typert Agent and Session lookups used by other Remote namespaces. Queue mutation has one narrow exception: a live child whose current projected identity is continuable and comes from its own non-seed suffix accepts the ordinary Edit, Remove, and QueueDock Steer actions across both inbox destinations. One-shot, missing, unknown, corrupt, seed-only, or cold children remain rejected without resume. The skill catalog uses a live Agent when present or the recorded preset's standing scope when cold, so listing never starts an Agent. The authenticated delivery routes use `workspaceDesktop()` for the serving Host name and file-manager behavior. `openWorkspacePath({ path, action: "reveal" })` delegates file-manager navigation to the native adapter; omitting `action` opens the default application.

`ctx.sessions.registerAdmission(sessionId, route)` and `registerAdmissionAdapter(adapter)` install feature-owned Client routes for exact Session identities or matching adapters. Late registration, replacement, and revocation apply immediately to existing `Session` bindings because each Session resolves the live owner at prompt, cancel, queue mutation, and command time. Exact identities outrank adapters; the default conflict strategy replaces the prior exact owner, while `conflict: 'reject'` throws. An outdated disposer does not revoke a newer owner. A hit that fails or throws never falls through to stock Host Remote endpoints, including `subagents.prompt` and `subagents.interruptByParent` for a catalog-addressed child, and a command never becomes a prompt. Unmatched Sessions keep stock Remotes, including those subagent routes when no admission owns the child. Registration does not grant Host authority; titles and ordinary subagent addresses are not credentials. An admission `prompt` receives the optional `requestId` supplied to `Session.prompt`; a feature that admits a durable user message or queue occurrence must preserve it as the user source's `rpcId`, so the caller's local submission echo converges on the authoritative projection. `modelRoute` returns a discriminated stock or feature route. An ordinary listed Session receives the stock `session.selectModel` route; consumers combine it with the shared Host catalog and durable `modelSelection` projection. A feature route must implement both `inspect`, which reports its effective selection and routability, and `selectModel`; this keeps feature-owned state out of ordinary Session projections. Catalog-addressed and `origin: 'subagent'` identities stay hidden unless a feature `modelRoute` opens them; Host `session.selectModel` refuses those identities (`session/agent-busy`) and this Client does not retarget the parent. An admission that owns `modelRoute` replaces stock, including an explicit undefined hide; omitting the field is not a hide. `commandCatalogSessionId` and `skillCatalogSessionId` remain lookup-only display helpers. `ui-commands` and `ui-skill` list through those identities; execute stays on the composer Session. `historyScope: 'owned-suffix'` trims the Client event window using Host follow `inheritedEventCount`. A later `session/end-seed` does not raise that floor; the durable log is unchanged. `ui-better-sidebar` registers the Side Chat adapter on `registerAdmissionAdapter` for draft and known Side Chat ids.

Feature callbacks return `SessionAdmissionResult`: its failure branch carries the distributed `code`, `message`, and `details` fields without constructing `RemoteError`. Session Controller rebuilds that Error for the public `RemoteResult`, preserves an already marked `RemoteFailure`, and classifies any other callback throw as `gateway/internal`; the same normalization wraps feature `inspect` and `selectModel` methods.

Host apply optionally injects `memberQuestionReceiver`. While that service is absent the Session Controller stays active and does not register a materializer; when the service appears, including after HMR, the same inject callback installs the unique arrival Session materializer, human-turn admitter, and terminal Session sync. Authenticated ingest creates or continues the receiver-owned Session identity, attaches the bound Workspace, records ignorable `member-question/received` metadata, injects the Decision Brief without starting a model turn, and flushes persistence. A failed arrival flush leaves `materialized` false so a later ingest retries the same identity. A durable terminal resumes that already-materialized Session and appends ignorable `member-question/settled` once; a failed flush retries after `receivingTerminalRetryMs`. Human-turn admission resumes the same Session, marks `source.kind=user` with the reserved rpcId, and steers or follows up; an unmaterialized identity is refused instead of creating a second Session. Unloading the controller cancels timers, refuses stale writes, waits for in-flight syncs, and withdraws both registrations.

The Client apply injects every required generated namespace, including `remote.memberQuestion`, and registers `ctx.receivingQuestions` as a Cordis service. That book loads `memberQuestion.snapshot`, settles through `memberQuestion.settle`, and unloads with the fiber. A missing required namespace parks the plugin until `$mount` provides it; apply does not probe `ctx.remote.memberQuestion` after `remote.session` and treat an in-progress mount as a hard failure.

`ctx.sessions.binding(id)` remains a render-safe lookup: it never opens Host history or refreshes a catalog. `stageProvisional()` inserts one caller-supplied renderer-only Session identity into the ordinary list and binding cache without changing `list.current`. A Host list refresh keeps that unpublished row, and a Host baseline that already lists the id publishes it in place while preserving the same binding. `openForRender()` is the explicit-render Host I/O — it skips history while the identity remains provisional, opens history plus the subagent catalog after Host publication without selecting it, and no-ops for an unknown identity. Duplicate staging of the same identity fails loud. Host publication upgrades the same identity and `SessionBinding` in place; the stage disposer then no-ops so it cannot remove the published Session. Release of an unpublished identity removes its row and Agent scope exactly once, including before the first successful Host list baseline. The renderer consumes only `UiSession.adapter.resolve(sessionId)` and does not own this lifecycle.

The Client adapter exposes `SessionEventStream`, a Gateway `RemoteJournalStream` bound to one ordinary or direct-subagent address. It opens follow before the initial page, publishes only contiguous `replace`, `prepend`, `append`, and `settle-assistant` changes, and repairs reconnect or sequence gaps through a tail page. Backwards paging has two verbs: `loadOlder()` pulls one 50-message page, and `loadThrough(seq)` — the turn-jump loader — loops 200-message pages until the window covers the target seq, lowering a shared target on repeated calls, stopping on a page that makes no progress, and reporting busy through the same `loadingOlder` snapshot bit. The Web adapter explicitly opts into cursorless Assistant frames: each opening carries the active attempt's `startedAfterSeq`, `nextIndex`, and compact stream, and every stream member becomes a Client-only `assistant/live-chunk` entry ordered between durable cursors. The Host captures a follower-local arrival ordinal with that baseline and suppresses buffered frames at or before the cut; a replacement Agent may restart frame revision at one. A durable `assistant/message` or `assistant/attempt` arriving after an active opening stays staged only when its seq follows `startedAfterSeq` and its Turn and Step match; the matching end type, seq, and index publishes one named settlement delta that retires the attempt's transient rows and adds the durable entry while earlier same-step retries remain visible. Revision, dense-index, or settlement gaps for a known attempt reopen follow, while a controller that missed the start ignores unknown-attempt frames and publishes their durable settlement normally. An abandoned end publishes a settlement delta without a durable entry so its transient rows retire immediately. A durable gap-repair page has no Assistant baseline, so its held notification reopens follow once for a paired page and baseline. Every history record covers exactly its event seq. A business, persistence, or unresolved continuity failure terminates the stream, while only physical carrier loss selects automatic resumption. `SessionControlStream` is a Gateway `RemoteSnapshotStream`; every generation opens with a complete process-local baseline, so reconnect replaces queue, jobs, and projection state instead of treating transient values as durable events. For each inbox change, the Host publishes the projection frame first and derives the queue replacement from that same validated post-fold value, so listener registration order cannot produce a stale queue frame.Client Agent contexts provide the identity used by the independent [`fileUpload`](../../client/file-upload/README.md) service; Session objects expose lifecycle, prompt, queue, and history operations rather than file transfer.

The Session object also carries local submission echoes: `session.beginSubmission` inserts one into `SessionSnapshot.pendingSubmissions` synchronously, before the caller serializes and prompts, so a conversation UI can show the message on the submit click's own frame. The echo stores ordered image previews and durable file references. Session derives its `transcript`, `queued`, or `steering` placement from the current running state and requested delivery mode, then retains that placement while serialization is in flight. The prompt's `requestId` is the correlation identity: the Host echoes it as the durable user source's `rpcId`, and queue occurrences project it as `SessionQueuedItem.rpcId`. An echo retires one animation frame after its durable event or queue occurrence is observed, immediately when its identified prompt fails or is abandoned, and as failed on disposal. Each retirement fires `onRetire` exactly once; an observed retirement includes the ordered durable attachment references so the composer can release successful cards while preserving failed drafts. Echoes are Client memory only; reload and reconnect rebuild the conversation from durable events alone.


<a id="session-media-references"></a>
## Session media references

`SessionMediaReferences` mounts `GET|HEAD /api/file?path=<absolute path>` on the authenticated `connection.fetch` channel when `connection`, `fs`, and `attachments` are composed. It reads ordinary files through `ctx.fs`, including temporary paths outside registered workspaces and files in remote providers. Neither directory containment nor MIME categories restrict access; `mime-types` supplies the response type, with `application/octet-stream` for unknown extensions. GET reuses `readBytes` for preflight and ongoing byte limits; HEAD reads metadata only. All files use `ctx.attachments.imageLimits.maxImageBytes` (normally 20 MiB); exceeding this limit returns 413. Responses contain the complete file, ignore Range, and carry `private, no-store`, `nosniff`, and a sandbox CSP so directly opened HTML/SVG cannot execute with the API origin. The Client rewrite lives in `ui-chat` (`AssistantMarkdown`); audio/video responses are available, while Markdown audio/video player nodes remain separate work.

-----

`SessionSnapshot.promptRoute` identifies the current `session`, `subagent`, or registered `feature` prompt dispatcher. Admission registration, replacement, and revocation refresh it without changing the subagent address or `parentAvailable`; registration does not grant Host permissions. A received `member-question/received` brief makes a Session nonblank before any model turn. Projection state version 2 refolds older Session-list metadata caches.

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `nativeOpen` | platform-detected | Whether Session workspace paths can be handed to a native desktop opener |
| `receivingTerminalRetryMs` | `1,000` | Delay between failed member-question terminal Session sync attempts |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-session-controller) is the exhaustive source for accepted fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as invoked Agent commands own any model-visible effect.

#### KV Cache effect

No direct effect; model requests remain owned by the Agent and LLM packages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The image byte cap does not validate decoded dimensions or pixel count.
- Control baselines represent process-local state and therefore cannot reconstruct jobs after a Host restart.
- A failed follow resumption remains visible to the caller instead of retrying indefinitely.
- Remaining ApiProxy member-question methods are `workspaceBinding`, `ensureWorkspaceBinding`, and `bindWorkspace`. Snapshot, settle, and human-turn admission are generated `memberQuestion` Remotes.
- The raw browser upload is one streaming HTTP request without resumable offsets; a retry sends the file again from byte zero.
- File-reference completion uses the shared Agent lookup and can resume a cold Session; the `skills/list` catalog is the non-activating alternative for skill metadata.
- Client admission registry dispatch covers prompt, cancel, queue mutation, and command on exact identities and adapters, including blocking stock subagent prompt and interrupt routes on a hit. A discriminated `modelRoute` pairs ordinary Sessions with stock selection plus shared catalog/projection state, while feature routes inspect and select feature-owned state; catalog children stay hidden until a feature route opens them. Omitting `modelRoute` is not a hide. `commandCatalogSessionId` and `skillCatalogSessionId` are lookup-only display helpers consumed by `ui-commands` and `ui-skill`. `historyScope: 'owned-suffix'` trims the displayed window from Host `inheritedEventCount`; a later `session/end-seed` does not raise that floor. `ui-better-sidebar` registers the Side Chat adapter.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Every page and frame is checked against the addressed durable Session.

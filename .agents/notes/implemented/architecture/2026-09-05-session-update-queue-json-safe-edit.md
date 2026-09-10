# Agent Note: JSON-safe Session queue-edit Remote content

Status: implemented

English | [中文](2026-09-05-session-update-queue-json-safe-edit.zh.md)

## Problem

`session.updateQueue` sits on a Typert Remote, so every request field must be JSON-safe at the process boundary. `QueueAction.edit.content` previously reused merge-extensible `ContentBlock[]`. That union includes tool-call, tool-result, and plugin-widened members whose JSON Schema objects carry unconstrained `unknown`, so Host Typert analysis fails at `SessionController.updateQueue` and never emits `./remote` artifacts.

The Web queue dock edits text-only rows. A pending inbox occurrence may nevertheless contain text and Host-authorized `ImageAttachmentRef` values. Replacing its content with prompt `PromptContentPart[]` either drops those references or accepts raw bytes through a second attachment-admission path. Queue edit must preserve the authorized images without trusting caller-supplied reference metadata.

## Decision

`QueueAction.edit.content` is the closed JSON-safe `QueueEditContentPart` union: `{ type: 'text'; text: string }` plus `{ type: 'image'; attachment: ImageAttachmentRef }`. The Host groups the exact pending occurrence's image refs by id in content order, and each submitted image consumes the next ref for that id. Caller-supplied media type, byte count, dimensions, and name never replace the stored values. Unknown ids fail with `QUEUE_EDIT_ATTACHMENT_NOT_REFERENCED`; consuming an id more times than it occurs fails with `QUEUE_EDIT_ATTACHMENT_MULTIPLICITY`; leaving any occurrence unconsumed fails with `QUEUE_EDIT_ATTACHMENT_OMITTED`. All failures use `session/attachment-invalid` and leave the occurrence unchanged. Raw prompt image bytes, tool blocks, and plugin blocks are outside the generated Remote type and fail wire validation before this operation.

## Alternatives considered

**Keep `ContentBlock[]` and weaken Typert to allow unconstrained `unknown`.** Rejected: the generator's JSON-safety check is the process-boundary invariant. Lowering it would hide other illegal Remote fields.

**Hand-write `lib/typert.remote-client.*`.** Rejected: generated Remote files are the source of Client `ctx.remote` types. Hand edits drift from Host methods.

**Reuse `PromptContentPart[]`.** Rejected: its image member carries raw base64 for `session.prompt` admission and cannot identify an already-authorized pending image.

**Drop edit and keep only remove/steer.** Rejected: Clients already edit pending text through `updateQueue`; removing the verb would delete a live control-plane operation.

**Admit new images on queue edit through `admitPromptContent`.** Rejected: queue mutation is not an attachment-admission operation. New images remain owned by `session.prompt`.

## Consequences

Typert can analyze and emit Session and Workspace Host-for-Client Remotes, including `ctx.remote.directoryPicker`. Queue-edit callers may rewrite text while retaining the exact image occurrence multiset, but cannot mutate authorized references, multiply repeated model inputs, or admit new images. The generated Client and Gateway exercise legal mixed edits, multiplicity rejection, and raw prompt-image rejection. The Web queue dock remains text-only and keeps mixed rows non-editable.

# Agent Note: JSON-safe Session queue-edit Remote content

Status: implemented

English | [中文](2026-09-05-session-update-queue-json-safe-edit.zh.md)

## Problem

`session.updateQueue` sits on a Typert Remote, so every request field must be JSON-safe at the process boundary. `QueueAction.edit.content` previously reused merge-extensible `ContentBlock[]`. That union includes tool-call, tool-result, and plugin-widened members whose JSON Schema objects carry unconstrained `unknown`, so Host Typert analysis fails at `SessionController.updateQueue` and never emits `./remote` artifacts. Queue edits still must refuse image and other attachment admission; they cannot become an open content dump.

## Decision

`QueueAction.edit.content` is the same JSON-safe `PromptContentPart[]` used by `session.prompt`. The Host still rejects every non-text part as `session/attachment-invalid` with `QUEUE_EDIT_NON_TEXT` before replacing the pending inbox occurrence. Accepted edits map only `{ type: 'text', text }` blocks into the inbox. Image, tool, and plugin content stay off this Remote. Workspace `directoryPicker` Remotes (`pick`, `list`, `createDirectory`) already use JSON-safe listing types and generate beside this Session contract.

## Alternatives considered

**Keep `ContentBlock[]` and weaken Typert to allow unconstrained `unknown`.** Rejected: the generator's JSON-safety check is the process-boundary invariant. Lowering it would hide other illegal Remote fields.

**Hand-write `lib/typert.remote-client.*`.** Rejected: generated Remote files are the source of Client `ctx.remote` types. Hand edits drift from Host methods.

**Drop edit and keep only remove/steer.** Rejected: Clients already edit pending text through `updateQueue`; removing the verb would delete a live control-plane operation.

**Admit images on queue edit through `admitPromptContent`.** Rejected for this slice: queue mutation is text-only control of a still-pending occurrence. Attachment admission remains on `session.prompt`.

## Consequences

Typert can analyze and emit Session and Workspace Host-for-Client Remotes, including `ctx.remote.directoryPicker`. Queue-edit callers send prompt parts, not log `ContentBlock`s. Non-text edits still fail with the existing attachment-invalid code. Member Question snapshot/settle Remotes remain a later #590 slice; ApiProxy is not deleted here.

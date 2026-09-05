# Agent Note: Session Controller admits Companion opaque files

Status: implemented

English | [中文](2026-09-05-session-admit-attachment-remote.zh.md)

## Problem

Desktop Companion already calls `session.admitAttachment` with exact decrypted file bytes. The attachment seam can persist those bytes as `ByteAttachmentRef`, but the Gestalt Session Controller Host Remote had no admission method. Leaving the call on ApiProxy would keep a dead `FileAttachmentRef` / `saveFile` import, and an image-only Remote would drop generic Companion files.

## Decision

`SessionController` owns `session.admitAttachment` through `SessionAttachmentAdmission`. The method resumes the ordinary Session, then reuses `ApiSessionAgentController.serializeImageAdmission` so concurrent `operationId`s for one Session serialize at the live Agent/Session commit point. After the chain holds, it scans the Session log for that `operationId`: matching `sha256` / bytes / mediaType / name returns the recorded `ByteAttachmentRef`; a mismatch fails as `ATTACHMENT_OPERATION_COLLISION` without appending. A first admission calls `saveBytes`, appends ignorable `session/attachment-admitted` (`source: 'companion'`), and `sessions.flush`. Wire bounds match the historical Companion schema (operation id ≤ 128, media type ≤ 127, name ≤ 255, canonical base64 for ≤ 100 MiB). Opaque files never become `ImageBlock`s or prompt text. `session.attachment` remains image read. Desktop still targets the name `session.admitAttachment`; swapping the Desktop caller off ApiProxy is a later wiring change.

## Alternatives considered

**A parallel per-Session ledger outside the Agent controller.** Collision checks and appends would race the live log. The existing admission chain already serializes image prompt admission for that Agent.

**Image-only `saveImage`.** Companion submits arbitrary decrypted files, including PDFs and text.

**Restore `FileAttachmentRef`.** The byte seam already publishes `ByteAttachmentRef`; an alias would hide the image/file split.

## Consequences

Host tests persist real local objects and JSONL logs for idempotent retries, collisions, over-limit payloads, concurrent identical operations, and ignorable reopen. ApiProxy still contains the old method until Desktop is retargeted. Persistence-catalog regeneration for the event payload waits on that owner move.

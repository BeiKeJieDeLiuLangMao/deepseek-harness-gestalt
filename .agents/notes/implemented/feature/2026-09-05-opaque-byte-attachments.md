# Agent Note: Opaque byte attachments share the image object store

Status: implemented

English | [中文](2026-09-05-opaque-byte-attachments.zh.md)

## Problem

Encrypted Companion admission needs to persist exact generic file bytes on the Host before a log-only `session/attachment-admitted` event. The attachment seam only stored normalized images: `ImageAttachmentRef`, `saveImage`, and `readImage`. Restoring a `FileAttachmentRef` alias would hide that images and opaque files have different metadata and never share an `ImageBlock`.

## Decision

`AttachmentStore` now owns opaque files as a second public path. `saveBytes` and `readBytes` take and return `ByteAttachmentRef` (`attachmentId`, declared `mediaType`, `bytes`, lowercase hex `sha256`, optional stripped `name`). Local storage publishes those exact bytes into the existing `<DSH_HOME>/attachments/v1/objects/<prefix>/<sha256>` tree with the same staging, exclusive hard-link, fsync, and failed-staging cleanup used for images. Equal bytes still share one object. Write-time size is `Config.maxByteBytes` (default 100 MiB). Empty payloads, invalid media types, and names that strip to empty are refused before any object is published. Reads re-check digest and recorded length; they do not decode rasters or apply current write caps. Providers that do not persist opaque files keep the default `ATTACHMENT_BYTES_UNSUPPORTED` refusal. Opaque bytes never become model-visible `ImageBlock`s. Session Controller Remote admission and `operationId` idempotency remain a later Host slice.

## Alternatives considered

**Restore `FileAttachmentRef` / `saveFile`.** The historical names would make image and file references look interchangeable and would reintroduce a compatibility alias this seam no longer owns.

**A second database or object root for files.** Companion files and images already share content-addressed bytes and durability proof; a parallel store would duplicate fsync and cleanup without changing the public types.

**Image-only Remote admission.** Desktop Companion submits arbitrary decrypted files. Restricting Host storage to `saveImage` would drop that path.

## Consequences

Local tests persist PDF and plain-text bytes under a temporary `DSH_HOME`, prove empty/over-limit/invalid-name cleanup, and reread after a later tighter cap. Image admission is unchanged. Host `session.admitAttachment` still has to call `saveBytes` in a later change; this slice does not append session events or send bytes to a model.

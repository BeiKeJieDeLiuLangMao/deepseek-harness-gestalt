# Agent Note: Official document preview owns file editors

Status: implemented

English | [中文](2026-09-13-official-document-preview-editors.zh.md)

## Problem

A second built-in file tab can outrank the official document-preview fallback and replace its bounded paging, renderer registry, version handling, and sandboxed HTML with another loading pipeline. Editing a loaded prefix also risks overwriting the unread tail.

## Decision

`ui-sidebar-documentpreview` remains the only built-in owner of Session file addresses, preview loading, renderer selection, and tab lifetime. It declares the keyed Session slot `sidebar.right.tab.document.editor`; supplemental packages register editor metadata and bodies under existing document renderer ids without registering another file tab or viewer inventory.

The official owner offers editing only when its ordinary line-paged reader has reached EOF. The editor receives that complete text and may write through its private capability. A successful write returns the tab to Preview and restarts the official reader from line 1; no local draft or guessed version becomes authoritative preview content.

Dirty drafts are retained only for the official tab-record lifetime. Close admission belongs to the official file definition and asks before discarding dirty content. Retained editor text is not persisted in layout or Session data.

## Alternatives considered

A second paging RPC or Better `fs.read` controller duplicates the existing `workspaceFiles.read` semantics and can stall beyond a fixed byte prefix. A full-byte read for editing rejects files that paged preview can display and creates a second version source. Saving a partial prefix is rejected because it destroys unread content. A chain editor slot adds meaningless ordering; a single editor slot cannot express renderer-specific eligibility.

## Consequences

Markdown, code, plain text, image, PDF, HTML, navigation, retry, EOF, version-change, and sandbox behavior continue through the official preview implementation. Better Sidebar can supplement plain-text, Markdown, and code editing but cannot claim file addresses or load preview content. Large files remain safely previewable and become editable only after paging reaches EOF.

## Verification

Focused tests cover official page loading, retries, version isolation, tab abort, editor metadata disposal, dirty close admission, and save-triggered reread ownership. Host `workspaceFiles.read` tests with real temporary files remain the source of truth for UTF-8 decoding, long lines, byte caps, and cross-page version behavior.

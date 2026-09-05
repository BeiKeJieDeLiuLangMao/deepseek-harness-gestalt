# Agent Note: Better Sidebar 0.18.0 source refresh without parallel Side Chat

Status: implemented

English | [中文](2026-09-06-better-sidebar-0-18-source-refresh.zh.md)

## Problem

The snapshot was still pinned at Better Sidebar 0.16.1 (`f9153dfc`). 0.18.0 (`f59ffd07`) ships split-sidebar modules, a locale chunk, changes/diff work, and `remote.session.openWorkspacePath`, but it also restores an in-tab transcript/polling Side Chat that this repository retired in favor of the canonical `conversation` mount.

## Decision

Import only `dsh.plugin.json`, `src`, and `tsdown.config.ts` from `f9153dfc` to `f59ffd07`. Do not import `src/client/sidechat-transcript.ts`. Keep the canonical Side Chat tab: provisional identity, `uiRenderer.mountSession(..., 'conversation', ...)`, first-prompt Host publication, restore/close, and the existing admission adapter object. Adopt `src/client/chunks/locale.tsx` and add `locale` to `CHUNKS` / `CHUNK_NAMES` so Host serves `lib/client-locale.js`. Replay every LOCAL-MODIFICATIONS row; record each as retained, relocated, adopted, or retired in that file.

`SessionAdmissionAdapter` still type-imports `@deepseek-ai/dsh-client-runtime/client`. ClientSessions does not yet register or dispatch the full adapter (handles, owned-suffix history, prompt start vs published prompt, cancel, queue, permission, modelRoute). Leave that routing incomplete rather than invent an empty interface or compatibility barrel. Source import may land; assembled Side Chat is not accepted until that owner exists.

## Alternatives considered

**Take the entire 0.18 Side Chat view, including transcript polling and history menu.** Rejected because that would restore a parallel renderer and drop the approved Conversation mount.

**Declare a local empty `SessionAdmissionAdapter` so Typert and the snapshot compile.** Rejected because optional chaining already silently skips registration; an empty type would hide the missing ClientSessions dispatch.

**Wait for GitHub merge of #589/#591 before importing source.** Rejected for this isolated worktree: the allowed source pin can land while those contracts stay listed as incomplete.

## Consequences

The snapshot pin is 0.18.0 / `f59ffd07`. Split-sidebar, locale chunk, and LOCAL chrome remain. Parallel Side Chat transcript stays absent. Admission routing remains a documented incomplete dependency.

## Verification

Focused checks: no `sidechat-transcript` path; `CHUNKS` includes `locale`; `SideChatView` still calls `mountSession` on `conversation`; LOCAL-MODIFICATIONS lists all 24 rows with dispositions; `dsh.plugin.json` version is `0.18.0`. This slice does not claim package tests, Typert catalog, or assembled Web/Electron evidence.

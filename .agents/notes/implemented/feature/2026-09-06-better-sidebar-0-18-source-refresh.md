# Agent Note: Better Sidebar source refresh and canonical Side Chat

Status: implemented

English | [中文](2026-09-06-better-sidebar-0-18-source-refresh.zh.md)

## Problem

Better Sidebar main supplies file-tree, editor, diff, and terminal behavior, while Gestalt owns the canonical Conversation renderer and Desktop chrome. Replacing the subtree wholesale would restore the upstream Side Chat renderer and discard those product obligations.

## Decision

Pin main at `d88dcfc3a50b43d4fc8baef961a8cc75809f41a6` (version label `0.18.1`). Import only `dsh.plugin.json`, `src`, and `tsdown.config.ts`; repository manifests, tests, and documentation remain locally owned. Replay every row in [LOCAL-MODIFICATIONS.md](../../../../packages/client/ui-better-sidebar/LOCAL-MODIFICATIONS.md).

Keep Side Chat provisional identity, the canonical `conversation` mount, first-prompt publication, model and permission admission, persistent restoration, and serialized close. The inherited count covers only the captured parent prefix; the appended child descriptor remains the first owned event. Upstream seed-marker changes cannot replace this count with the entire seed length. Desktop overlay menus, window drag space, and phone tab badges remain product adaptations.

## Alternatives considered

**Replace the whole subtree.** Rejected because it would restore a parallel transcript and composer and discard the admission and chrome owners.

**Skip all files with local changes.** Rejected because it would also omit independent file-tree, preview, terminal, and menu fixes. Resolve compatible changes per hunk and keep a pinned source record.

## Consequences

The snapshot adopts upstream file-tree rename/delete, preview reading and redaction, expanded diffs, quoted terminal configuration, and regex terminal waits. The local test suite owns regression evidence for source updates and preserved product adaptations. Package checks do not establish assembled Web or Electron acceptance.

## Verification

Check the exact pin and allowed import paths, run the Sidebar suite and bundle, and verify canonical Side Chat and Desktop behavior through their existing tests. New source regressions exercise root and overwrite refusal, symlink deletion, terminal argument grouping, a real PTY regex wait, and preview redaction.

# Agent Note: Restore the ticketed per-file coverage inventory

Status: implemented

English | [中文](2026-08-21-coverage-inventory-restore.zh.md)

## Problem

After #182 made the coverage lane evaluate per-file 100% again, thirty-one Gestalt files failed the inventory. Later PRs added owning tests, then hid those files behind `vitest.config.ts` `coverage.exclude` entries (`TODO(gui)` and `TODO(#168,#170)`). A green coverage lane that excludes the ticketed product files does not satisfy #185.

## Decision

Remove the #185 paths from `coverage.exclude`. Existing owning tests already reach per-file 100% for Desktop Account/updater, attachment lightbox/image, Schedule list, Models editor/tags, Platform HTTP/Redis/client indexes, Schedule plugin index, session-log export, loader-smoke, Markdown text, Web Search cards, and API-proxy fetch. `web-search-deepseek` `index.ts` gains credential-fallback and ByteString-rejection cases so `resolveApiKey` no longer leaves those branches out of the inventory. Other `TODO(gui)` exclusions that #185 did not name stay in place.

This note supersedes the remaining-exclusion sentence in the [inherited baseline CI reds note](../bug-fix/2026-08-19-inherited-ci-baseline-reds.md).

## Alternatives considered

**Keep the ticketed files excluded as GUI or companion debt.** Rejected: #185 requires missing tests or a justified exclusion per file. These files already have owning tests; the exclude list was the unjustified part.

**Rewrite the thirty-one files to shrink branches instead of measuring them.** Rejected: the gap was the inventory, not an API change.

## Consequences

A workflow-only PR on this head must keep the Linux coverage lane green without those thirty-one paths in `coverage.exclude`. New branches in `web-search-deepseek` `resolveApiKey` need a covering case before merge.

## Verification

Focused Vitest coverage with `--coverage.include` on each restored path is per-file 100%, including `packages/web/web-search-deepseek/tests` and `packages/host/apiproxy/tests/{session-export,fetch-carrier,client-handler}.spec.ts`.

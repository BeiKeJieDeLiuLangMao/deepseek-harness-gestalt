# Agent Note: Yield official turn-tail takeover when explicit deliverables exist

Status: implemented

English | [中文](2026-09-12-official-turn-tail-deliverables-fusion.zh.md)

## Problem

Under default settings (`interceptOpenPath: true`), Better Sidebar registered an eager `conversation.chat.turnTail` chain handler at `priority: -1` in `registerOfficialTurnTail`. Its selector matched any turn that had produced files, rendering `OfficialProducedFiles`. However, `OfficialProducedFiles` only renders the produced-file chips row and lacks support for explicit file delivery cards (`PresentedFileCard`). When a turn executed both file mutations and the `present` tool (such as generating an SVG and presenting it), the higher-priority takeover eclipsed the official `ui-deliverables` component (`priority: 0`), causing all presented deliverable cards, sidebar preview buttons, and file action menus to be omitted from the conversation flow.

Additionally, in `preview-boot.e2e.ts`, the browser-only worker deployment tests boot-time network degradation on a static host. The fusion of `ui-phone` and `ui-better-sidebar` introduced legitimate static 404 responses for host-only capabilities (`/phone/environment` and `/sidebar/api/shell.get`) that failed the test's static 404 allowlist.

## Decision

1. In `packages/client/ui-better-sidebar/src/client/official-open-routing.tsx`, `registerOfficialTurnTail` now checks `hasPresentedDeliverables(owner)`. If the turn declared explicit deliverables in `deliverables.presented`, the takeover declines (`returns null`), allowing the official `ui-deliverables` component to render both the produced-files row and the presented deliverable cards.
2. In `packages/client/ui-better-sidebar/tests/official-open-routing.client.spec.ts`, added a negative test verifying that `definition.select(ownerWithPresented)` declines when explicit deliverables are present.
3. In `apps/web/tests/preview-boot.e2e.ts`, extended the accepted static 404 response list to include `/phone/environment` and `/sidebar/api/shell.get`, documenting their designed degradation when running without host backends.
4. Regenerated `snapshots/web/present-svg/session.v3.jsonl` using `DSH_SNAPSHOT=refresh` to incorporate upstream `subagent/model-selection-policy` events while preserving all existing model outputs and SVG artifacts.

## Consequences

- Delivered file cards remain visible and actionable in conversation under default settings without requiring tests or users to set `interceptOpenPath: false`.
- Preview boot tests pass cleanly with verified explanations for all static host 404 probes.

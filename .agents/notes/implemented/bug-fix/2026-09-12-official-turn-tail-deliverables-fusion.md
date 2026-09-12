# Agent Note: Yield official turn-tail takeover when explicit deliverables exist

Status: implemented

English | [中文](2026-09-12-official-turn-tail-deliverables-fusion.zh.md)

## Problem

Under default settings (`interceptOpenPath: true`), Better Sidebar registered an eager `conversation.chat.turnTail` chain handler at `priority: -1` in `registerOfficialTurnTail`. Its selector matched any turn that had produced files, rendering `OfficialProducedFiles`. However, `OfficialProducedFiles` only renders the produced-file chips row and lacks support for explicit file delivery cards (`PresentedFileCard`). When a turn executed both file mutations and the `present` tool (such as generating an SVG and presenting it), the higher-priority takeover eclipsed the official `ui-deliverables` component (`priority: 0`), causing all presented deliverable cards, sidebar preview buttons, and file action menus to be omitted from the conversation flow.

Additionally, in `preview-boot.e2e.ts`, the browser-only worker deployment tests boot-time network degradation on a static host. The fusion of `ui-phone` and `ui-better-sidebar` introduced legitimate static 404 responses for host-only capabilities (`/phone/environment` and `/sidebar/api/shell.get`) that failed the test's static 404 allowlist.

## Decision

1. In `packages/client/ui-better-sidebar/src/client/official-open-routing.tsx`, `registerOfficialTurnTail` now checks `hasPresentedDeliverables(owner)` against `owner: TurnTailOwnerProps`. If the turn declared explicit deliverables in `deliverables.presented` before `owner.seq`, the takeover declines (`returns null`), allowing the official `ui-deliverables` component to render both the produced-files row and the presented deliverable cards.
2. In `packages/client/ui-better-sidebar/tests/official-open-routing.client.spec.ts`, added a negative test matrix verifying that `definition.select` declines when explicit deliverables are present or mixed, preserves produced files when no deliverables exist or when deliverables belong to future sequences, and isolates other turns.
3. In `apps/web/tests/preview-boot.e2e.ts`, refined the static failure verification to assert exact `status === 404` for each request (`GET /open-in-app/apps 404`, `GET /phone/environment 404` x2, `GET /plugins/events 404`, `POST /sidebar/api/shell.get 404`), documenting their designed degradation when running without host backends.
4. Regenerated `snapshots/web/present-svg/session.v3.jsonl` using `DSH_SNAPSHOT=refresh` to incorporate upstream `subagent/model-selection-policy` events while preserving all existing model outputs and SVG artifacts.

## Alternatives considered

**Forcing `interceptOpenPath: false` in tests.** Rejected: setting the preference to false conceals the fact that Better Sidebar's turn-tail takeover eclipses delivered file cards under default settings. The default experience must preserve delivered file cards out of the box.

**Re-implementing deliverable cards inside `OfficialProducedFiles`.** Rejected: `@deepseek-ai/dsh-client-ui-deliverables` already owns complete deliverable rendering, host state inspection, and file action menus. Recreating those capabilities in Better Sidebar creates maintenance duplication.

## Consequences

- Delivered file cards remain visible and actionable in conversation under default settings without requiring tests or users to set `interceptOpenPath: false`.
- Preview boot tests pass cleanly with verified explanations for all static host 404 probes.

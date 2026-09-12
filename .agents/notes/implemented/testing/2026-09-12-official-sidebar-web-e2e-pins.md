# Agent Note: Official Sidebar seating, projected v3 fixtures, and live tool-catalog harvest

Status: implemented

English | [中文](2026-09-12-official-sidebar-web-e2e-pins.zh.md)

## Problem

Required snapshots and coverage on the 0.1.5 merge failed after official Sidebar fusion and Session v3 projection. Web e2e still waited for Better DockKit Files trees, `容量 N` disclosures, and a 45% right-column width. `desktop-chrome` replayed a packed v3 JSONL that lacked `delegationDepth` and still carried retired `request/header.system`. Side Chat replay still pointed at `session.jsonl` and a v0 child log. `collectToolCatalog` no longer harvests `list_subagent_models` under default subagent config.

## Decision

Web e2e seats official Sidebar through `[data-sidebar-right-expand]`, the Files guide entry, and `data-files-state="tree"`. DeepSeek model capacity uses `高级设置 N`. Right-column geometry uses `defaultWidthPercent` 35. `produced-files.overlay.yml` pins `nativeOpen` for headless CI. `desktop-chrome` and Side Chat child logs are projected v3 Session fixtures with `delegationDepth: 0`, no packed `assistant/chunk` rows, and no retired header.system. Side Chat replay reads `session.v3.jsonl`. Catalog harvest pins omit `list_subagent_models` unless model-selection settings are mounted.

## Alternatives considered

**Hand-insert `delegationDepth` into the packed desktop-chrome JSONL.** Rejected: current projected fixtures cannot contain packed rows, and v3 `request/header` rejects `system`.

**Keep Side Chat child replay as a v0 chunk-only log.** Rejected: `loadSessionScripts` now restores current format, so a child log must be a complete projected Session.

**Treat missing Files trees as a golden relaxation.** Rejected: official Sidebar starts on the guide; e2e must open the Files entry rather than assume a seeded tree.

## Consequences

A Web e2e that opens the right column must wait for official expand, then Files if the tree is absent. Live Session pins that emit `approval/policy` remain refresh-owned projected v3 artifacts. Catalog tests follow the default harvested names, not every tool a composition can later enable.

# Agent Note: Official Sidebar chrome pins, model-selection-policy fixtures, and Browser Dock seating

Status: implemented

English | [中文](2026-09-12-web-sidebar-chrome-and-policy-pins.zh.md)

## Problem

Required `node 24 / snapshots and artifacts` on the 0.1.5 merge failed after official Sidebar fusion. Web ARIA goldens still named Better chrome (`More actions`, `Open right sidebar`, `Open the sidebar`). Live Session fixtures omitted `subagent/model-selection-policy`. `browser-dock` e2e waited on Better toggle clusters and treated off-screen page chrome as open. Annotation persistence still targeted a textarea composer and a missing `session.jsonl`.

## Decision

Web expected Markdown uses official chrome: `Open sidebar` and `Open the bottom panel`. Live v3 Session fixtures that emit `approval/policy` also record `subagent/model-selection-policy` with `allowedModels: []`, refreshed through `DSH_SNAPSHOT=refresh` rather than hand-edited seqs. `browser-dock` seeds a v3 header with `isSeeded` and `delegationDepth`, opens the collapsed preview then official Sidebar, and treats page chrome as shown only when it occupies the viewport. Annotation persistence uses the contenteditable composer, `textContent`, `authenticatedUrl`, and a header-only `session.v3.jsonl` beside the override. Official Browser recovery tripwire ignores the expected `browser target is not present` page error while the Runtime rebinds.

## Alternatives considered

**Hand-insert `subagent/model-selection-policy` into every `session.v3.jsonl` and `session.v2.jsonl`.** Rejected: v2 has no such event, and inserting a row without refresh shifts later `sourceEventSeqs`.

**Keep `browser-dock` on Better `data-dsh-toggle-cluster` and `dsh-sidebar:v1`.** Rejected: official page chrome lives in the Sidebar tab; persistence is `dsh-sidebar-workbench:v1`.

**Treat missing screenshots as a golden relaxation.** Rejected: Host `screenshot` already returns the PNG; the client must paint it once observe settles.

## Consequences

A Web ARIA golden that names Sidebar chrome must match official locale keys. A compareReplay v3 fixture that records `approval/policy` must also record empty `subagent/model-selection-policy` from refresh. Browser Dock e2e must open official Sidebar seating rather than Better DockKit clusters.

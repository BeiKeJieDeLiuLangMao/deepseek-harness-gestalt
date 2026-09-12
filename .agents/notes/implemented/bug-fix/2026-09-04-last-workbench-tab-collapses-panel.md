# Agent Note: Closing the last workbench tab collapses the panel

Status: implemented

English | [中文](2026-09-04-last-workbench-tab-collapses-panel.zh.md)

## Problem

Closing the last docked tab in the right or bottom workbench left an empty panel open. The remaining welcome cards occupied the conversation column with no user-owned tab, so the workbench looked unfinished after the user had finished with it.

## Decision

Official `ui-sidebar-right` `closeTab` collapses only the surface that lost its last docked tab. Emptiness ignores floating windows, so a remaining float does not keep an empty docked tree open. Undocking the last docked tab into a float does not collapse the panel. A later content open still expands the landing panel. The unused Better snapshot store no longer owns this path.

## Alternatives considered

**Collapse both panels whenever either tree is empty.** Rejected because the unused tree starts empty; closing a right-side file would also hide the bottom workbench.

**Leave empty welcome cards visible.** Rejected because the user already closed the last tab; keeping the panel open after that is the defect.

## Consequences

An empty workbench after the last close is collapsed. Opening another file or URL expands it again. Type-only `+` clicks still do not expand a collapsed panel.

## Testing

`packages/client/ui-sidebar-right/tests/stores.client.spec.ts` closes the last non-guide docked tab, a remaining sibling tab, and a floating tab that must not collapse the column.

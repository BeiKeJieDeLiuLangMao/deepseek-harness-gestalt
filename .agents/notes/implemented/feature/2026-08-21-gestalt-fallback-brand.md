# Agent Note: Gestalt fallback brand

Status: implemented

English | [中文](2026-08-21-gestalt-fallback-brand.zh.md)

## Problem

A source or unsigned Web build that does not set `DSH_CLIENT_TITLE` and does not occupy `sidebar.brand.name` showed **DSH Local Build** in the document title and the sidebar brand fallback. That string names a checkout, not this product.

## Decision

The unset-title fallback and the unoccupied sidebar name are **DSH Gestalt**. `apps/web/index.html` and the Vite title rewrite needle use the same string so a source launch and a titled build stay aligned. A build that sets `DSH_CLIENT_TITLE` still wins. `ui-brand-official` still occupies the brand slots with the official wordmark when that plugin is loaded.

## Alternatives considered

**Keep DSH Local Build for source launches.** Rejected because the Web chrome the user actually sees is this product's name, not the checkout kind.

**Change only the sidebar fallback and leave the document title.** Rejected because the two surfaces share one unset-title meaning; splitting them would make a titled tab disagree with the brand row.

**Replace the official wordmark plate with GESTALT.** Rejected here. That occupant is a different slot. This note only owns the fallback when the occupant is absent.

## Consequences

Local `pnpm dsh web` without a title define shows DSH Gestalt in the tab and in the sidebar when no brand plugin occupies the name slot. Packaged Desktop that already sets a product title is unchanged.

## Testing

`packages/client/ui-renderer/tests/document-title.client.spec.tsx` pins the unset-title fallback. `packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx` and the sidebar snapshot pin the unoccupied name. `apps/web/tests/built-boot.snapshot.ts` still asserts the official wordmark occupies the name so the fallback string is absent.

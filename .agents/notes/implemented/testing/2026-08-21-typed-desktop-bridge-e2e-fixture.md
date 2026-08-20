# Agent Note: Type-complete DesktopBridge Web E2E fixture

Status: implemented

English | [中文](2026-08-21-typed-desktop-bridge-e2e-fixture.zh.md)

## Problem

Desktop chrome Web E2E installs `window.dshDesktop` before the assembled client apply. The apply path synchronously binds Account and Pairing subscriptions. An updater-and-window-only stub throws before the drag strip renders, and an untyped inline mock that omits a later required preload member fails as a thirty-second selector timeout instead of a type error.

## Decision

`packages/client/ui-desktop/tests/desktop-bridge-fixture.client.ts` owns the inert Desktop Host preload. `installDesktopBridgeFixture` returns `DesktopBridge`, so a missing required member fails typecheck. Account and Pairing subscriptions deliver the pre-answer `unavailable` snapshots on subscribe; unsubscribe removes the listener so later inert verbs do not notify it. `apps/web/tests/desktop-chrome.e2e.ts` dynamically imports that function and passes it to Playwright `addInitScript`, so the host typecheck program does not load `packages/client/*/src`. The [web GUI browser e2e lane](2026-07-24-web-gui-browser-e2e-lane.md) still owns the assembled replay lane; this note owns the typed fixture.

## Alternatives considered

**Keep the complete mock inline in `desktop-chrome.e2e.ts`.** The page script can stay self-contained, but the object is not checked against `DesktopBridge`, so a new required member regresses as a browser timeout.

**Type-assert the inline object as `DesktopBridge`.** An assertion accepts an incomplete literal; the missing-member failure stays a timeout.

**Ship the fixture from the `@deepseek-ai/dsh-client-ui-desktop` `/client` export.** That widens the public plugin API for a Playwright-only installer.

**A second committed JavaScript file loaded with `addInitScript({ path })`.** The typed TypeScript fixture and the serialized installer would drift.

## Consequences

A required `DesktopBridge` member must be added to the fixture in the same change that adds it to the preload interface. Playwright serializes the installer into the page, so the function body cannot close over imported runtime values; type-only imports stay erased. The client typecheck program owns the fixture; the host program must not statically import it.

## Testing

- `pnpm exec vitest run packages/client/ui-desktop/tests/desktop-bridge-fixture.client.spec.ts`
- `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/desktop-chrome.e2e.ts`

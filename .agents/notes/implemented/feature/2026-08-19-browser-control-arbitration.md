# Agent Note: Browser control arbitration

Status: implemented

English | [中文](2026-08-19-browser-control-arbitration.zh.md)

## Problem

A user may need to type, click, solve a CAPTCHA, or confirm a login on the same real tab the Agent is driving. Without a shared revision and an explicit control owner, an Agent mutation based on a stale observation can overwrite the human's work or lose the Session, Profile, browser instance, and tab.

## Decision

Human pointer and keyboard input and Agent commands target the same Browser Workspace tab. Observable open and unavailable page state carry `controlOwner` (`agent` | `human`) plus the revision later mutations must match. `controlOwner` is reported ownership. The lock is the revision: after `observe`, an Agent `navigate` or `focus` that matches the current revision reclaims the tab without `returnControl`. `input` records one human mutation, advances the revision, and sets `controlOwner` to `human`. `takeover` records human ownership without changing page content. `returnControl` records Agent ownership. Session, Profile, browser instance, and tab identities stay the same across takeover and return.

Providers serialize every mutation and reject a stale `expectedRevision` with `BROWSER_REVISION_CONFLICT`. The conflict message names the current revision and tells the Agent to observe again. Agent `navigate` and `focus` set `controlOwner` to `agent`. Browser tools do not set `ask` or a permission classifier; this ticket adds no approval product. Existing approval and permission capabilities apply only when a later composition attaches them.

`dsh-browser-workspace` persists each tab's current control owner on the Session `browser/workspace` snapshot so later Dock UI can restore it after Session switch and reload. The deferred Consumer renders `controlOwner` into the ordinary tool result and adds `browser_input`, `browser_takeover`, and `browser_return_control` without a second tool-card format. Waiting, running, complete, and connection-loss facts stay on the existing tool result and `unavailable` state.

## Alternatives considered

**Let last writer win without a revision check.** Rejected because a late Agent command would silently overwrite a human login or CAPTCHA answer.

**Give the human a second browser instance or transferred page.** Rejected because the ticket requires the exact Session, Profile, browser instance, and tab to survive takeover and return.

**Add a second tool-card or ownership event stream for Dock.** Rejected because Dock UI is a later ticket and the existing ordinary tool result plus Session Workspace snapshot already carry truthful ownership and availability facts.

## Consequences

Human and Agent can share one tab without losing identity. A stale Agent mutation fails loudly and forces a fresh observation. Session snapshots persist the current control owner for later Dock UI. Dock chrome and release remain later tickets.

## Verification

- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/browser-workspace packages/browser/tool-browser`
- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/browser-workspace packages/browser/tool-browser --coverage --coverage.include='packages/browser/browser-runtime/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-deterministic/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-tandem/src/**/*.ts' --coverage.include='packages/browser/browser-workspace/src/**/*.ts' --coverage.include='packages/browser/tool-browser/src/**/*.ts'`
- `pnpm run test:snapshot -t 'temporary Browser Profile|Tandem Browser Profile'`
- Real Tandem e2e remains gated by `DSH_TANDEM_CHECKOUT` and `DSH_TANDEM_BIN` and covers both arrival orders when those are set.

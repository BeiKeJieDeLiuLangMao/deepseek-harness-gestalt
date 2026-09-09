# Agent Note: Electron Browser stall recovery

Status: implemented

English | [中文](2026-09-10-electron-browser-stall-recovery.zh.md)

## Problem

The Electron Browser Runtime serialized navigation and page observation through one operation queue. A page whose Chromium load never settled held that queue until the request deadline, while the Desktop loopback `/status` route entered the same queue to observe every tab. Tandem startup health therefore waited behind the stalled page and later Browser tabs remained in creation even though the HTTP service itself was running.

## Decision

A navigation failure with `BROWSER_RUNTIME_UNAVAILABLE` schedules the same target recovery used by an unhealthy observation. Recovery commits an unavailable receipt, destroys the unhealthy page, recreates it at the last committed URL, and releases the serialized queue for later creates and operations.

The loopback adapter receives the owning `Context` and synchronizes a cache from committed `browser/runtime-state` events. `/status` reads that cache synchronously and reports HTTP service readiness without observing page contents. Open receipts refresh the cached inventory and close receipts remove its tab. Live tab listing and page-content routes continue to observe Chromium and expose current page data.

## Alternatives considered

**Increase the navigation timeout.** Rejected because an external page can remain unsettled indefinitely, and a longer bound would only delay Browser recovery.

**Keep live page observation in `/status`.** Rejected because startup health answers whether the local HTTP service is ready; making it depend on arbitrary page JavaScript and Chromium loading couples service admission to page availability.

**Return the navigation failure without recovery.** Rejected because the timed-out WebContents can retain incomplete load state and must not remain the backing page for later operations.

## Consequences

One stalled page fails at the configured request deadline and is replaced while later Browser creates and local navigation proceed. `/status` remains available during the failure and carries the last committed tab inventory until recovery commits its replacement. Page-level routes retain live observation cost and failure semantics.

## Testing

Unit coverage holds page observation indefinitely while `/status` returns, checks cached create, navigation, recovery, and close receipts, and verifies a timed-out navigation recovers the addressed target before another create succeeds. The real Electron launcher serves a local response that never completes, observes the deadline and recovered `about:blank` page, then creates another tab and loads a responsive local page.

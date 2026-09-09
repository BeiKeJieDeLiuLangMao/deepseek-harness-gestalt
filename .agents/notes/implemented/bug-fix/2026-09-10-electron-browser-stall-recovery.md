# Agent Note: Electron Browser stall recovery

Status: implemented

English | [中文](2026-09-10-electron-browser-stall-recovery.zh.md)

## Problem

The Electron Browser Runtime serialized navigation and page observation through one operation queue. A page whose Chromium load never settled held that queue until the request deadline, while the Desktop loopback `/status` route entered the same queue to observe every tab. Tandem startup health therefore waited behind the stalled page and later Browser tabs remained in creation even though the HTTP service itself was running. `webContents.stop()` can leave the operation promise pending, so joining that promise without a second bound also retained the queue after either the Runtime deadline or an earlier caller cancellation.

## Decision

A navigation failure with `BROWSER_RUNTIME_UNAVAILABLE` schedules the same target recovery used by an unhealthy observation. Cancellation gives `webContents.stop()` the configured `cancelTimeoutMs` to settle the operation. If the promise remains pending, the Runtime destroys the owned page window, observes any later promise rejection, and advances the queue. A caller cancellation retains its `BROWSER_ABORTED` result; a committed target whose window was destroyed enters the same unhealthy recovery. Recovery recreates the last committed URL and reattaches a presented page to its Host parent and bounds only while that presentation request remains active.

The loopback adapter receives the owning `Context` and synchronizes a cache from committed `browser/runtime-state` events. `/status` reads that cache synchronously and reports HTTP service readiness without observing page contents. Open receipts refresh the cached inventory and close receipts remove its tab. Live tab listing and page-content routes continue to observe Chromium and expose current page data.

## Alternatives considered

**Increase the navigation timeout.** Rejected because an external page can remain unsettled indefinitely, and a longer bound would only delay Browser recovery.

**Keep live page observation in `/status`.** Rejected because startup health answers whether the local HTTP service is ready; making it depend on arbitrary page JavaScript and Chromium loading couples service admission to page availability.

**Return the navigation failure without recovery.** Rejected because the timed-out WebContents can retain incomplete load state and must not remain the backing page for later operations.

**Advance the queue while leaving the WebContents alive.** Rejected because the pending operation could mutate the same page concurrently with later serialized work. Destroying its owning page window ends that native lifecycle before the queue advances.

## Consequences

One stalled page fails after the configured request and cancellation bounds and is replaced while later Browser creates and local navigation proceed. A caller abort settles after the cancellation bound without changing its public failure code. Presented tabs stay in the same viewport after recovery, while a concurrent conceal prevents them from being shown again. `/status` remains available during the failure and carries the last committed tab inventory until recovery commits its replacement. Page-level routes retain live observation cost and failure semantics.

## Testing

Unit coverage holds page observation indefinitely while `/status` returns, checks cached create, navigation, recovery, and close receipts, and makes `stop()` leave a presented load pending across both the Runtime deadline and caller cancellation. Both paths destroy the page after the cancellation bound, recover the addressed target, and restore its active presentation; a cancellation that settles during the grace keeps its page. The real Electron launcher attaches the page to a Host window, serves a local response that never completes, observes the deadline and recovered `about:blank` page, then creates another tab and loads a responsive local page.

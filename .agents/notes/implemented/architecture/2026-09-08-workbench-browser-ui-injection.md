# Agent Note: Injecting Browser UI behavior into the workbench

Status: implemented

English | [中文](2026-09-08-workbench-browser-ui-injection.zh.md)

## Problem

The snapshot browser tab needs ui-browser's settings, official React chrome, and revision-conflict recovery. Direct feature imports impose synchronous module-table ordering and let workbench bind a second settings reader independently of the browser UI owner.

## Decision

ui-browser declares and provides the required Cordis `browserUi` face. `createRequest()` resolves the latest provider preferences; `renderPageChrome(props)` returns the existing BrowserPageChrome element with its hooks; `recoverListedMutation` performs the existing mutation followed by at most one observe and retry, returning undefined for a closed target. Workbench imports only the face declaration and waits for the provider before publishing `workbenchBrowser` or subscribing to reconciliation. Provider unload removes that consumer and its subscriptions, stops new bridge calls, and awaits accepted create, close, navigation, and recovery operations. Late replies cannot update sidebar tabs or run queued reconciliation. Reload activates a new bridge after that teardown settles. Each render call receives the captured provider renderer as a private prop; a foreign snapshot component context cannot select another Browser UI provider.

The [Client dependency classification](../process/2026-08-23-client-cross-package-value-dependencies.md) continues to route presentation contributions through their declaring slots. This face serves the existing non-slot snapshot renderer adapter: BrowserView delegates to `workbenchBrowser.renderTab`, and OfficialBrowserTab binds Session and tab metadata before requesting the provider's component. It introduces no alternate page placement or generic component registry. ui-browser still owns the preview and settings slots; workbench owns page-to-tab reconciliation as described by the [official browser decision](../feature/2026-08-21-workbench-official-browser.md).

## Alternatives considered

**Retain feature module-table imports.** Their synchronous ordering violates the Client dependency classification and obscures provider lifetime.

**Move browser behavior into a static utility.** Profile preferences and React chrome have a feature owner and lifecycle; their reuse does not make them generic utilities.

**Replace the snapshot renderer with a new slot system.** The current BrowserView already has one official renderer adapter. Another placement mechanism would expand the product change without improving that ownership.

## Consequences

Create identity follows the same live preferences as Browser settings. Real page chrome, refresh, observe, screenshot, and stale-close recovery keep their implementation. Workbench requires ui-browser availability; it cannot activate with settings alone. The overlay document still publishes the renderer face without reconciling or presenting official pages.

Provider order, unload/reload with deferred Remote replies, subscription disposal, dynamic identities, captured-provider rendering, and close retry are exercised through provider and consumer tests. The [Browser Dock scenario](../../../../apps/web/tests/browser-dock.e2e.ts) uses the shipped Web Host, authenticated Browser Workspace RPC, Session projections, and built client plugins. The deterministic Browser Runtime supplies configured page text and PNGs; provider replacement rejects the old Runtime and target, then the recovered page completes a real UI Refresh with a larger revision. An independent navigation produces a real stale-close conflict. Electron acceptance owns live page presentation.

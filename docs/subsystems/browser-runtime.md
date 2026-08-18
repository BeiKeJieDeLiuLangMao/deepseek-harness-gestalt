# Browser Runtime

English | [中文](browser-runtime.zh.md)

The Browser Runtime capability separates the provider-neutral [`ctx.browserRuntime`](../../packages/browser/browser-runtime) service, the keyless [`dsh-browser-runtime-deterministic`](../../packages/browser/browser-runtime-deterministic) Provider, and the deferred [`dsh-tool-browser`](../../packages/browser/tool-browser) Consumer. It is an optional capability outside the Agent loop.

## Identity and state

A `BrowserTarget` contains four opaque branded identities: Profile, Workspace, browser instance, and tab. Callers carry the complete target returned by `create`; none of its string values have caller-visible structure. Open state contains URL, title, text, focus, and revision facts. Closed state is a terminal receipt retaining the target and revision.

## Concurrency and lifecycle

Providers serialize operations. `navigate`, `focus`, and `close` require the last observed revision and reject stale mutations. `observe` and `screenshot` do not advance the revision. The deterministic Provider publishes committed states on `browser/runtime-state`; its invariant checks that identity stays stable and revisions advance exactly once. Teardown stops new admission, drains accepted operations, and closes an open temporary Profile.

## Discovery and replay

The Consumer registers six deferred ordinary tools. `tool_search` returns schemas without activating tools, and current eligibility remains authoritative. Every operation renders complete Browser facts into the durable ordinary tool result. Together with logged request headers, the Session can reconstruct exactly what the model saw without Browser-specific Session events or conversation cards.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowserruntime--browserruntime-abstract-seam"></a>

### `ctx.browserRuntime` — `BrowserRuntime` (abstract seam)

Browser Runtime Service Definition. Providers serialize mutations and reject a stale `expectedRevision`; Consumers can therefore coordinate Agent and human operations without relying on last-writer-wins state.

```ts cordis-catalog
/**
 * Create one temporary Profile, Workspace, browser instance, and tab.
 * @param request - Temporary-profile request and cancellation signal.
 * @returns initial open page state at revision zero.
 */
abstract create(request: BrowserCreateRequest): Promise<BrowserPageState>

/**
 * Navigate the addressed tab after checking its expected revision.
 * @param request - Target, expected revision, URL, and cancellation signal.
 * @returns committed open page state.
 */
abstract navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>

/**
 * Observe the latest open or closed state for one target.
 * @param request - Target and cancellation signal.
 * @returns current state without changing its revision.
 */
abstract observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState>

/**
 * Capture deterministic PNG bytes for the addressed open tab.
 * @param request - Target and cancellation signal.
 * @returns screenshot bytes and depicted page facts at the current revision.
 */
abstract screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot>

/**
 * Focus the addressed tab after checking its expected revision.
 * @param request - Target, expected revision, and cancellation signal.
 * @returns committed focused page state.
 */
abstract focus(request: BrowserMutationRequest): Promise<BrowserPageState>

/**
 * Close the addressed tab and its temporary Profile after checking its expected revision.
 * @param request - Target, expected revision, and cancellation signal.
 * @returns terminal close receipt.
 */
abstract close(request: BrowserMutationRequest): Promise<BrowserClosedState>
```

Source: [`packages/browser/browser-runtime/src/index.ts:55`](../../packages/browser/browser-runtime/src/index.ts)

<a id="browser-events"></a>

### `browser/*` events

<a id="browserruntime-state--emit"></a>

#### `browser/runtime-state` — emit

A Browser Runtime Provider committed a new lifecycle state.

```ts cordis-catalog
/**
 * A Browser Runtime Provider committed a new lifecycle state.
 * @mode emit
 * @param state - Complete committed state after the operation.
 */
'browser/runtime-state'(state: BrowserRuntimeState): void
```

Source: [`packages/browser/browser-runtime/src/index.ts:46`](../../packages/browser/browser-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->

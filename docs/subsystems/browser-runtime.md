# Browser Runtime

English | [中文](browser-runtime.zh.md)

The Browser Runtime capability separates the provider-neutral [`ctx.browserRuntime`](../../packages/browser/browser-runtime) service, the keyless [`dsh-browser-runtime-deterministic`](../../packages/browser/browser-runtime-deterministic) Provider, and the deferred [`dsh-tool-browser`](../../packages/browser/tool-browser) Consumer. It is an optional capability outside the Agent loop.

## Identity and state

A `BrowserTarget` contains four opaque branded identities: Profile, Workspace, browser instance, and tab. Callers carry the complete target returned by `create`; none of its string values have caller-visible structure. Open state contains URL, title, text, focus, and revision facts. Closed state is a terminal receipt retaining the target and revision.

## Concurrency and lifecycle

Providers serialize operations. `navigate`, `focus`, and `close` require the last observed revision and reject stale mutations. `observe` and `screenshot` do not advance the revision. The deterministic Provider admits one temporary Profile lifecycle for its whole lifetime; close is terminal, and a later create rejects with `BROWSER_CAPACITY`. Teardown stops new admission, drains accepted operations, and closes an open temporary Profile.

The deterministic Provider publishes committed states on `browser/runtime-state`. Each observer failure is contained after commit, later observers still run, and asynchronous observers are not awaited. Its invariant seeds from the Provider's authoritative current state on initial load and hot reload, then checks stable identity, exact revision succession, and terminal closure.

## Discovery and replay

The Consumer registers six deferred ordinary tools. `tool_search` returns schemas without activating tools, and current eligibility remains authoritative. Every operation renders complete Browser facts into the durable ordinary tool result. Together with logged request headers, the Session can reconstruct exactly what the model saw without Browser-specific Session events or conversation cards.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowserruntime--browserruntime-abstract-seam"></a>

### `ctx.browserRuntime` — `BrowserRuntime` (abstract seam)

Browser Runtime Service Definition. Providers serialize every operation, own target lifecycles, and reject stale mutations. Callers retain returned targets and revisions but do not dispose Provider resources directly. A method resolves only after its state commit and synchronous post-commit notification attempts; asynchronous observers are not awaited.

```ts cordis-catalog
/**
 * Create one temporary Profile, Workspace, browser instance, and tab.
 * @param request - Temporary-profile request and cancellation signal.
 * @returns initial open page state at revision zero; its target addresses every later operation in
 * this lifecycle.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED` when cancellation wins, `BROWSER_CAPACITY`
 * when this Provider cannot admit another lifecycle, or `BROWSER_DISPOSED` after teardown starts.
 */
abstract create(request: BrowserCreateRequest): Promise<BrowserPageState>

/**
 * Navigate the addressed tab after checking its expected revision.
 * @param request - Target, expected revision, URL, and cancellation signal.
 * @returns committed open page state whose revision replaces the caller's prior revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, `BROWSER_REVISION_CONFLICT`, or `BROWSER_UNKNOWN_URL` when the corresponding
 * precondition fails before commit.
 */
abstract navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>

/**
 * Observe the latest open or closed state for one target.
 * @param request - Target and cancellation signal.
 * @returns current state after earlier queued operations, without changing its revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, or
 * `BROWSER_NOT_FOUND`; a closed target is returned rather than rejected.
 */
abstract observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState>

/**
 * Capture PNG bytes for the addressed open tab.
 * @param request - Target and cancellation signal.
 * @returns screenshot bytes and depicted page facts from one serialized read at the current revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, or `BROWSER_UNKNOWN_URL` when the Provider cannot depict the addressed open
 * page.
 */
abstract screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot>

/**
 * Focus the addressed tab after checking its expected revision.
 * @param request - Target, expected revision, and cancellation signal.
 * @returns committed focused page state whose revision replaces the caller's prior revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, or `BROWSER_REVISION_CONFLICT` when the corresponding precondition fails
 * before commit.
 */
abstract focus(request: BrowserMutationRequest): Promise<BrowserPageState>

/**
 * Close the addressed tab and its temporary Profile after checking its expected revision.
 * @param request - Target, expected revision, and cancellation signal.
 * @returns terminal close receipt retained by the Provider for later observation.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, or `BROWSER_REVISION_CONFLICT` when the corresponding precondition fails
 * before commit.
 */
abstract close(request: BrowserMutationRequest): Promise<BrowserClosedState>
```

Source: [`packages/browser/browser-runtime/src/index.ts:58`](../../packages/browser/browser-runtime/src/index.ts)

<a id="browser-events"></a>

### `browser/*` events

<a id="browserruntime-state--emit"></a>

#### `browser/runtime-state` — emit

Post-commit Browser Runtime lifecycle notification. Providers contain synchronous throws and asynchronous rejections from each listener, continue the fan-out, and never change a committed operation's outcome; returned promises are observed but not awaited.

```ts cordis-catalog
/**
 * Post-commit Browser Runtime lifecycle notification. Providers contain synchronous throws and
 * asynchronous rejections from each listener, continue the fan-out, and never change a committed
 * operation's outcome; returned promises are observed but not awaited.
 * @mode emit
 * @param state - Complete committed state after the operation.
 */
'browser/runtime-state'(state: BrowserRuntimeState): void
```

Source: [`packages/browser/browser-runtime/src/index.ts:48`](../../packages/browser/browser-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->

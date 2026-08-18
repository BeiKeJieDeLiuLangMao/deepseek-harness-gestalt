# 浏览器运行时

[English](browser-runtime.md) | 中文

Browser Runtime 能力把与 Provider 无关的 [`ctx.browserRuntime`](../../packages/browser/browser-runtime) 服务、无密钥 [`dsh-browser-runtime-deterministic`](../../packages/browser/browser-runtime-deterministic) Provider 与延迟 [`dsh-tool-browser`](../../packages/browser/tool-browser) Consumer 分离开来。它是 Agent loop 之外的可选能力。

## 身份与状态

`BrowserTarget` 包含四个不透明品牌身份：Profile、Workspace、浏览器实例与标签页。调用方携带 `create` 返回的完整 target；这些字符串值没有调用方可见结构。打开状态包含 URL、标题、文本、焦点与修订事实。关闭状态是保留 target 与修订号的终态回执。

## 并发与生命周期

Provider 串行执行操作。`navigate`、`focus` 与 `close` 要求最后观察到的修订号，并拒绝过期写入。`observe` 与 `screenshot` 不递增修订号。确定性 Provider 在其整个生命周期内只接收一个临时 Profile 生命周期；close 是终态，后续 create 会以 `BROWSER_CAPACITY` 拒绝。释放阶段停止接收新操作、排空已接受操作，并关闭仍打开的临时 Profile。

确定性 Provider 在 `browser/runtime-state` 上发布已提交状态。每个 observer failure 都在提交后受到容纳，后续 observer 继续运行，且异步 observer 不会被等待。其 invariant 在首次加载与热重载时从 Provider 的当前权威 state 建立基线，随后检查稳定身份、精确修订顺序与终态关闭。

## 发现与重放

Consumer 注册六个延迟普通工具。`tool_search` 返回 schema 但不激活工具，当前 eligibility 继续作为权威。每次操作把完整 Browser 事实渲染到持久普通工具结果中。结合已记录的请求头，Session 无需 Browser 专用 Session 事件或对话卡片，即可精确重建模型看到的内容。

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

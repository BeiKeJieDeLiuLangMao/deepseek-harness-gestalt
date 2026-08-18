# 浏览器运行时

[English](browser-runtime.md) | 中文

Browser Runtime 能力把与 Provider 无关的 [`ctx.browserRuntime`](../../packages/browser/browser-runtime) 服务、无密钥 [`dsh-browser-runtime-deterministic`](../../packages/browser/browser-runtime-deterministic) Provider、托管式 Tandem Browser 的 [`dsh-browser-runtime-tandem`](../../packages/browser/browser-runtime-tandem) Provider 与延迟 [`dsh-tool-browser`](../../packages/browser/tool-browser) Consumer 分离开来。它是 Agent loop 之外的可选能力。

## 身份与状态

`BrowserTarget` 包含四个不透明品牌身份：Profile、Workspace、浏览器实例与标签页。调用方携带 `create` 返回的完整 target；这些字符串值没有调用方可见结构。打开状态包含 URL、标题、文本、焦点与修订事实。关闭状态是保留 target 与修订号的终态回执。

`unavailable` 状态是对既有 target 的 Provider 可用性丢失的真实投影：托管式 Tandem Provider 在其子进程崩溃或健康检查失败时提交它，保留 target 与最后修订号，说明丢失原因，并标记进行中的重连。它不是终态关闭回执；重连成功后会以同一 target、下一修订号重新提交打开页面状态，重连耗尽则提交 `reconnect-failed`。

```ts type-equiv
/** Recoverable or terminal Provider availability loss for an existing target. */
interface BrowserUnavailableState {
  readonly status: 'unavailable'
  readonly target: BrowserTarget
  readonly revision: number
  readonly reason: 'crashed' | 'unhealthy' | 'reconnect-failed'
  readonly reconnecting: boolean
}
```

## 并发与生命周期

Provider 串行执行操作。`navigate`、`focus` 与 `close` 要求最后观察到的修订号，并拒绝过期写入。`observe` 与 `screenshot` 不递增修订号。确定性 Provider 在其整个生命周期内只接收一个临时 Profile 生命周期；close 是终态，后续 create 会以 `BROWSER_CAPACITY` 拒绝。释放阶段停止接收新操作、排空已接受操作，并关闭仍打开的临时 Profile。

确定性 Provider 为每个 generation 分配独立 owner token。其 invariant 在首次加载与热重载时从该 generation 的当前权威 state 建立基线，随后为稳定身份、精确修订顺序与终态关闭注册同步 pre-commit validator。验证失败时，原 state 仍是权威来源。提交后，Provider 在 `browser/runtime-state` 上发布状态；每个普通 observer failure 都受到容纳，后续 observer 继续运行，且异步 observer 不会被等待。

tandem Provider 持有一个固定上游 revision `3b613cfd4c299609ca7ca415d638c1b71c6ba5de` 的托管 Tandem Browser 子进程。它通过 subprocess 服务解析可执行文件并以脱敏环境 spawn，把 `baseUrl` 约束为绝对的 loopback HTTP origin，从 `tokenFile` 读取 bearer token，并在接收任何操作之前于 `startupTimeoutMs` 内轮询 `GET /agent/version` 与 `GET /status`。它恰好创建一个 Tandem session（`POST /sessions/create`）与一个临时 Profile 生命周期，把 DSH 持有的不透明身份投影到 Tandem tab id 之上。子进程崩溃或健康探测失败会提交 `unavailable` 状态，并最多尝试 `reconnectAttempts` 次子进程重启，成功后以同一 target 重新提交打开页面状态。释放阶段排空操作队列、销毁 session（`POST /sessions/destroy`）并 join 进程树。格式错误的 Tandem 响应以 `BROWSER_PROTOCOL` 拒绝；丢失或不可达的运行时以 `BROWSER_RUNTIME_UNAVAILABLE` 拒绝。出处与上游贡献候选见包内 [UPSTREAM.md](../../packages/browser/browser-runtime-tandem/UPSTREAM.md)。

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
 * when this Provider cannot admit another lifecycle, `BROWSER_DISPOSED` after teardown starts,
 * `BROWSER_PROTOCOL` when the upstream runtime breaks its response protocol, or
 * `BROWSER_RUNTIME_UNAVAILABLE` when the upstream runtime cannot be reached or starts unhealthy.
 */
abstract create(request: BrowserCreateRequest): Promise<BrowserPageState>

/**
 * Navigate the addressed tab after checking its expected revision.
 * @param request - Target, expected revision, URL, and cancellation signal.
 * @returns committed open page state whose revision replaces the caller's prior revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, `BROWSER_REVISION_CONFLICT`, or `BROWSER_UNKNOWN_URL` when the corresponding
 * precondition fails before commit, `BROWSER_PROTOCOL` when the upstream runtime breaks its
 * response protocol, or `BROWSER_RUNTIME_UNAVAILABLE` when it cannot be reached.
 */
abstract navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>

/**
 * Observe the latest open or closed state for one target.
 * @param request - Target and cancellation signal.
 * @returns current open, unavailable, or closed state after earlier queued operations. Read-only
 * observation does not advance the revision; an external Provider crash or reconnect may do so.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, or
 * `BROWSER_NOT_FOUND`; a closed target is returned rather than rejected, and an unavailable
 * upstream runtime is returned as its unavailable state. `BROWSER_PROTOCOL` is rejected when the
 * upstream runtime breaks its response protocol.
 */
abstract observe(request: BrowserObserveRequest): Promise<BrowserRuntimeState>

/**
 * Capture PNG bytes for the addressed open tab.
 * @param request - Target and cancellation signal.
 * @returns screenshot bytes and depicted page facts from one serialized read at the current revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, or `BROWSER_UNKNOWN_URL` when the Provider cannot depict the addressed open
 * page, `BROWSER_PROTOCOL` when the upstream runtime breaks its response protocol, or
 * `BROWSER_RUNTIME_UNAVAILABLE` when it cannot be reached.
 */
abstract screenshot(request: BrowserObserveRequest): Promise<BrowserScreenshot>

/**
 * Focus the addressed tab after checking its expected revision.
 * @param request - Target, expected revision, and cancellation signal.
 * @returns committed focused page state whose revision replaces the caller's prior revision.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, or `BROWSER_REVISION_CONFLICT` when the corresponding precondition fails
 * before commit, `BROWSER_PROTOCOL` when the upstream runtime breaks its response protocol, or
 * `BROWSER_RUNTIME_UNAVAILABLE` when it cannot be reached.
 */
abstract focus(request: BrowserMutationRequest): Promise<BrowserPageState>

/**
 * Close the addressed tab and its temporary Profile after checking its expected revision.
 * @param request - Target, expected revision, and cancellation signal.
 * @returns terminal close receipt retained by the Provider for later observation.
 * @throws `BrowserRuntimeError` with `BROWSER_ABORTED`, `BROWSER_DISPOSED`, `BROWSER_NOT_FOUND`,
 * `BROWSER_NOT_OPEN`, or `BROWSER_REVISION_CONFLICT` when the corresponding precondition fails
 * before commit, `BROWSER_PROTOCOL` when the upstream runtime breaks its response protocol, or
 * `BROWSER_RUNTIME_UNAVAILABLE` when it cannot be reached.
 */
abstract close(request: BrowserMutationRequest): Promise<BrowserClosedState>
```

Source: [`packages/browser/browser-runtime/src/index.ts:69`](../../packages/browser/browser-runtime/src/index.ts)

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

Source: [`packages/browser/browser-runtime/src/index.ts:59`](../../packages/browser/browser-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->

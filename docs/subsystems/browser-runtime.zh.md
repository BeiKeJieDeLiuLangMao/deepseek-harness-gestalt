# 浏览器运行时

[English](browser-runtime.md) | 中文

Browser Runtime 能力把与 Provider 无关的 [`ctx.browserRuntime`](../../packages/browser/browser-runtime) 服务、无密钥 [`dsh-browser-runtime-deterministic`](../../packages/browser/browser-runtime-deterministic) Provider 与延迟 [`dsh-tool-browser`](../../packages/browser/tool-browser) Consumer 分离开来。它是 Agent loop 之外的可选能力。

## 身份与状态

`BrowserTarget` 包含四个不透明品牌身份：Profile、Workspace、浏览器实例与标签页。调用方携带 `create` 返回的完整 target；这些字符串值没有调用方可见结构。打开状态包含 URL、标题、文本、焦点与修订事实。关闭状态是保留 target 与修订号的终态回执。

## 并发与生命周期

Provider 串行执行操作。`navigate`、`focus` 与 `close` 要求最后观察到的修订号，并拒绝过期写入。`observe` 与 `screenshot` 不递增修订号。确定性 Provider 在 `browser/runtime-state` 上发布已提交状态；其 invariant 检查身份保持稳定且修订号每次精确递增一次。释放阶段停止接收新操作、排空已接受操作，并关闭仍打开的临时 Profile。

## 发现与重放

Consumer 注册六个延迟普通工具。`tool_search` 返回 schema 但不激活工具，当前 eligibility 继续作为权威。每次操作把完整 Browser 事实渲染到持久普通工具结果中。结合已记录的请求头，Session 无需 Browser 专用 Session 事件或对话卡片，即可精确重建模型看到的内容。

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

# Agent Note: Browser 页 observe 与 screenshot 忽略回调身份

Status: implemented

[English](2026-09-12-browser-page-observe-identity.md) | 中文

## Problem

官方 Sidebar tab 里的 Browser chrome 能 observe 到 URL，但从不绘制确定性 PNG。`useBrowserPage` 把 `observe`、`screenshot`、`onMissingTarget` 以及 `target` 对象放进 effect 依赖。官方 workbench body 每次 render 都会重建这些函数并传入新的 target 对象，因此 observe 稳定后 effect 会取消进行中的 screenshot。

## Decision

`useBrowserPage` 把 observe、screenshot、missing-target recovery 和当前 target 存进 ref。effect 仅在 tab key 或 listed revision 变化时重跑。新的函数身份、或同一 tab key 的新 target 对象，不会打断进行中的 capture。官方 workbench chrome 仍 memoize recovery 与 retry；这不是 capture 完成的前提。

## Alternatives considered

**把 remote 留在 effect 依赖列表里，要求每个调用方自行 memoize。** 否决：官方 tab body 每次 render 都从 `useTabInfo()` 重建绑定 remote；即便调用方都 memoize，仍会拿到新的 `target` 对象。

**绘制 page text，而不是等待 screenshot。** 否决：Dock golden 钉的是 PNG alt text，且 Host `screenshot` 已经返回该图。

## Consequences

同一 tab 的 observe 与 screenshot 按 tab key 和 listed revision 各跑一次。原先依赖新 `observe` 身份来重触发加载的测试，必须改 `listedRevision` 或 tab key。

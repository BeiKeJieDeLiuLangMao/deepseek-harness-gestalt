# Agent Note: Electron Browser 卡顿恢复

Status: implemented

[English](2026-09-10-electron-browser-stall-recovery.md) | 中文

## Problem

Electron Browser Runtime 通过一个操作队列串行执行导航和页面观察。Chromium load 一直不结束的页面会占用该队列直到请求期限，而 Desktop loopback `/status` 路由为了观察每个标签也会进入同一队列。因此，即使 HTTP 服务本身已经运行，Tandem 启动健康检查仍会等待卡住的页面，后续 Browser 标签也会停留在创建状态。

## Decision

导航以 `BROWSER_RUNTIME_UNAVAILABLE` 失败时，会为同一 target 安排与异常观察共用的恢复流程。恢复提交不可用回执，销毁异常页面，在最后提交的 URL 上重建页面，并释放串行队列供后续 create 和操作使用。

loopback 适配器接收其所属 `Context`，并通过已提交的 `browser/runtime-state` 事件同步缓存。`/status` 同步读取该缓存，无需观察页面内容即可报告 HTTP 服务就绪状态。打开回执刷新缓存清单，关闭回执从中移除标签。实时标签列表与页面内容路由仍会观察 Chromium，并暴露当前页面数据。

## Alternatives considered

**增加导航超时时间。** 放弃该方案，因为外部页面可能永远无法稳定完成，更长的上限只会推迟 Browser 恢复。

**在 `/status` 中保留实时页面观察。** 放弃该方案，因为启动健康检查回答的是本地 HTTP 服务是否就绪；让它依赖任意页面 JavaScript 与 Chromium 加载，会把服务准入与页面可用性耦合起来。

**直接返回导航失败而不恢复。** 放弃该方案，因为超时的 WebContents 可能保留未完成的加载状态，不能继续作为后续操作的底层页面。

## Consequences

单个卡住的页面会在配置的请求期限失败并被替换，后续 Browser create 与本地导航仍可继续。故障期间 `/status` 仍然可用，并在恢复提交替代页面前保留最后提交的标签清单。页面级路由保留实时观察的耗时与失败语义。

## Testing

单元覆盖让页面观察永久挂起并确认 `/status` 仍返回，检查缓存的 create、导航、恢复与关闭回执，并验证超时导航先恢复被定址的 target，随后另一次 create 成功。真实 Electron 启动器提供一个永不结束的本地响应，观察请求期限与恢复后的 `about:blank` 页面，然后创建另一个标签并加载可响应的本地页面。

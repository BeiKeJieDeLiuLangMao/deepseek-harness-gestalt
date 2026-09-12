# Agent Note: Electron Browser 卡顿恢复

Status: implemented

[English](2026-09-10-electron-browser-stall-recovery.md) | 中文

## Problem

Electron Browser Runtime 通过一个操作队列串行执行导航和页面观察。Chromium load 一直不结束的页面会占用该队列直到请求期限，而 Desktop loopback `/status` 路由为了观察每个标签也会进入同一队列。因此，即使 HTTP 服务本身已经运行，Tandem 启动健康检查仍会等待卡住的页面，后续 Browser 标签也会停留在创建状态。`webContents.stop()` 可能让操作 promise 继续等待，因此无界等待该 promise 会在 Runtime 期限或更早的调用方取消后继续占用队列。Host 恢复后，loopback 页面路由已经用同一 target 返回 revision 2，但生产 Tandem 客户端把此前的不可用响应当作协议错误，未再次读取外部 Host。官方 occurrence owner 还可能在未绑定的 Browser occurrence 收到 create 结果前恢复新投影页面，导致同一 target 出现两个 Sidebar 标签。

## Decision

导航以 `BROWSER_RUNTIME_UNAVAILABLE` 失败时，会为同一 target 安排与异常观察共用的恢复流程。取消时，Runtime 会在配置的 `cancelTimeoutMs` 内等待 `webContents.stop()` 结束操作。promise 仍未结束时，Runtime 会销毁所持有的页面窗口、观察其随后到达的 promise 拒绝，再推进队列。调用方取消仍返回 `BROWSER_ABORTED`；已提交 target 的窗口被销毁后，会进入相同的异常恢复流程。恢复会重建最后提交的 URL，并且仅在展示请求仍有效时，才把已展示页面重新附加到原 Host parent 和 bounds。

loopback 适配器接收其所属 `Context`，并通过已提交的 `browser/runtime-state` 事件同步缓存。`/status` 同步读取该缓存，无需观察页面内容即可报告 HTTP 服务就绪状态。打开回执刷新缓存清单，关闭回执从中移除标签。实时标签列表与页面内容路由仍会观察 Chromium，并暴露当前页面数据。

page-content 以 503 `BROWSER_RUNTIME_UNAVAILABLE` 报告不可用 target。生产 Tandem 客户端保留该错误码，把 revision 1 提交为重连中，并在 `startupTimeoutMs` 内轮询外部 Host，直到同一 target 暴露 revision 2。Browser occurrence owner 只恢复已物化 Sidebar Session 中的页面，并让等待中的未绑定 occurrence 先认领其页面，再恢复其他未认领页面。create 结束后会再次调和，包括失败与 occurrence 已移除的情况。

## Alternatives considered

**增加导航超时时间。** 放弃该方案，因为外部页面可能永远无法稳定完成，更长的上限只会推迟 Browser 恢复。

**在 `/status` 中保留实时页面观察。** 放弃该方案，因为启动健康检查回答的是本地 HTTP 服务是否就绪；让它依赖任意页面 JavaScript 与 Chromium 加载，会把服务准入与页面可用性耦合起来。

**直接返回导航失败而不恢复。** 放弃该方案，因为超时的 WebContents 可能保留未完成的加载状态，不能继续作为后续操作的底层页面。

**保留 WebContents 并直接推进队列。** 放弃该方案，因为等待中的操作可能与后续串行工作并发修改同一页面。销毁其所属页面窗口会在队列推进前结束原生生命周期。

## Consequences

单个卡住的导航会在配置的请求期限与取消期限后失败；恢复不会把该导航报告为成功。同一个 Sidebar occurrence 会在恢复后的 `about:blank` revision 上重新可用，并能再次导航。调用方取消会在取消期限后结束，同时保持其公开失败代码。已展示标签恢复后仍位于同一视口，而并发的 conceal 会阻止页面再次展示。故障期间 `/status` 仍然可用，并在恢复提交替代页面前保留最后提交的标签清单。页面级路由保留实时观察的耗时与失败语义。

## Testing

单元覆盖让页面观察永久挂起并确认 `/status` 仍返回，检查缓存的 create、导航、恢复与关闭回执，并让 `stop()` 在 Runtime 期限与调用方取消两条路径中都无法结束已展示页面的 load。两条路径都会在取消期限后销毁页面、恢复被定址的 target 并恢复有效展示；在宽限期内结束的取消则保留页面。跨 Provider 覆盖检查 HTTP 503 错误码，以及生产外部客户端从 open revision 0 经过 unavailable revision 1 恢复为同一 open target revision 2 的转换。客户端覆盖检查物化、等待中的 occurrence 认领、create 失败，以及随后恢复另一 target。真实 Electron 启动器把页面附加到 Host 窗口，提供一个永不结束的本地响应，观察导航失败与恢复后的 `about:blank` 页面，然后用同一个 Sidebar 标签加载可响应的本地页面。

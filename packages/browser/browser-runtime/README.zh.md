# @deepseek-ai/dsh-browser-runtime

[English](README.md) | 中文

这是与 Provider 无关的浏览器控制 Service Definition。`ctx.browserRuntime` 创建一个临时 Profile 层级，并以带品牌类型的 `BrowserProfileId`、`BrowserWorkspaceId`、`BrowserInstanceId` 与 `BrowserTabId` 标识每次操作。

## 服务 API

`create` 返回修订号为 `0` 的初始打开状态。`navigate`、`focus` 与 `close` 要求调用方提供最后观察到的 `expectedRevision`；Provider 串行执行操作，并用 `BROWSER_REVISION_CONFLICT` 拒绝过期写入。`observe` 与 `screenshot` 只读。`close` 返回保留全部四个不透明身份的终态回执。Service Definition 为每个方法记录其适用的稳定 `BrowserRuntimeError` code。

`BrowserRuntimeState` 携带打开、`unavailable` 与关闭三种状态。`unavailable` 状态是对既有 target 的 Provider 可用性丢失的真实投影：它保留 target 与最后修订号，说明原因（`crashed`、`unhealthy` 或 `reconnect-failed`），并标记进行中的重连；它不是终态关闭回执。针对不可用 target 的操作会以 `BROWSER_RUNTIME_UNAVAILABLE` 拒绝；无法解释其后端响应的 Provider 会以 `BROWSER_PROTOCOL` 拒绝。

Provider 在 `browser/runtime-state` 上发布已提交状态。该通知不可否决提交：每个同步抛错或异步拒绝都会被容纳，后续 listener 继续运行，且 Provider 不等待异步 listener 工作。带状态的 Provider 负责验证该可变关系；本定义包只负责类型、服务名称，以及 Provider 调用的共享队列、身份与通知辅助函数。

## 模型体验

通过负责渲染 Browser Runtime 结果的 dsh-tool-browser Consumer 间接影响模型。

#### KV 缓存影响

本包自身不增加模型 token，也不改变请求前缀。

## 已知限制与后续工作

- Service Definition 目前只表达临时单标签页 tracer；持久隔离、多 Workspace 与标签页，以及真实 Electron 后端属于后续能力 Provider。

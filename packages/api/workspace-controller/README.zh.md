---
description: "Host 与 Client 工作区控制：修改工作区导航并跟随其完整投影。"
kind: "package-reference"
---
# Workspace Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-workspace-controller` 拥有 Host 的 `ctx.workspaceController` 服务和生成的 Client `ctx.remote.workspace` namespace。它的 Remote 方法负责创建、重命名、移除和重排 Workspace，在 Workspace 内重排 Session，从 Workspace 导航中归档 Session，无 shell 读取 Workspace checkout 的 Git `origin`，以及跟随完整的 Workspace 投影。当 Client 必须修改或跟随 Workspace 导航时，请通过 API Gateway 使用它。本包同时拥有 `ctx.directoryPickerController` 与生成的 `ctx.remote.directoryPicker` namespace（`pick`、`list`、`createDirectory`），因为它承载的选目录 seam 是抽象的，自身从不作为 Loader entry。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Host 控制器会串行执行正确性取决于当前 registry 状态的变更，并为预期失败抛出带稳定 `workspace/*` 或 `directory-picker/*` 码的 `RemoteError`。`gitRemote({ workspaceId }, signal)` 先解析已注册 Workspace，再通过 argv 与 subprocess tree 服务运行 `git remote get-url origin`：`-C` 携带 Workspace 路径，环境经过白名单且非交互并设置 `LC_ALL=C`，stdout/stderr 上限 1 MiB，abort 会终止进程树。生产 Git 把调用方 signal 与 Host `gitTimeoutMs`（默认 30s，不超过 `MAX_TIMER_DELAY_MS`）融合；Host deadline 在 `terminate` 与 `waitForExit` 之后以 `workspace/git-failed` 拒绝。已配置 origin 返回 `{ remoteUrl }`。没有 `.git` 元数据的目录，或 Git 以 exit 2 报告缺少 `origin` 的 checkout，返回 `{}`。exit 128 仅在该 Workspace 没有 `.git` 路径时视为未绑定；存在 `.git` 却 exit 128、缺少 Git 可执行文件、信号终止、输出溢出、缺少 subprocess 服务，或其他执行失败都以 `workspace/git-failed` 拒绝。未知 Workspace id 在不 spawn Git 的情况下以 `workspace/not-found` 拒绝。调用方 abort 以 `gateway/cancelled` 拒绝。它的 `follow()` 流会同步订阅持久 Workspace 变更，先发出一份完整 baseline，再按顺序发出 `upsert`、`remove`、`order` 和 `archived` 增量。重连会以替换 baseline 开始新一代，因此消费方不依赖收到断线期间的每个增量。

Client 入口提供 `ClientWorkspaceModel` 和 `createWorkspaceStateStream()`。该模型拥有 Workspace 行、registry 顺序、已归档 Session id、一元变更回声，以及流与一元调用的竞态处理。较新的 Host 行按 `updatedAt` 获胜；已提交的流顺序优先于较旧的一元响应；已经移除的 Workspace id 不会被延迟数据复活。该包公开与框架无关的快照和订阅，把导航策略与 React hook 留给 UI owner。

-----

<a id="model-experience"></a>
## 模型体验

无，因为 Workspace 组织属于浏览器与 Host 控制状态，并且不注册提示词、工具或会话事件。

#### KV Cache 影响

无直接影响；Workspace 变更不会改变模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- `follow()` 在重连后替换完整投影，不提供持久 cursor 或增量追赶协议。
- 进程本地删除标记只会在 Client 模型生命周期内阻止延迟数据复活已移除的 Workspace。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。Workspace Registry 负责持久化，每次流生成都是完整投影。

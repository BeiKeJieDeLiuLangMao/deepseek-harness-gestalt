---
description: "DSH-better-sidebar 的固定源码快照，提供右侧栏与底部面板的 Host 和 Client 两半。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-better-sidebar

[English](README.md) | 中文

## 概述

使用固定版本的 Better Sidebar 快照提供工作台能力。Host 半区在信任栅栏后提供侧栏数据、媒体、预览、延迟 chunk 和终端 WebSocket；Client 半区把保留的能力注册到官方 Sidebar。上游刷新说明与仓库自有修改分别记录。

## 目录

- [包约定](#package-contract)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包约定

[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的钉死源码快照。Host 半边在 webServer 信任围栏后挂上 `/sidebar` JSON、媒体、HTML 预览、懒加载分块与终端 WebSocket 路由。Client 入口通过 `ctx.sidebarRight`、`ctx.sidebarRightTabs` 与 keyed Slot 贡献文件、viewer、变更、任务、Side Chat、终端、Browser 回退、设置与打开路由。它不再创建自己的 React root、布局 store、标签注册表或布局占位。共享快照镜像命名为 `SidebarContext`，避免 Host 类型目录把它误认成 Cordis `Context`。SHA 与更新步骤见 [UPSTREAM.md](UPSTREAM.md)。本仓持有的改动列在 [LOCAL-MODIFICATIONS.md](LOCAL-MODIFICATIONS.md)。

产品组合挂载本包与 [`dsh-client-ui-workbench`](../ui-workbench/README.zh.md)。Workbench 包通过官方注册表登记更高优先级的 Browser Workspace definition 与正文；沙箱 iframe 仍是独立安装时的回退。不要为了改产品行为去改快照源码。

客户端通过 `ctx.sidebarRightTabs` 为规范的 `dsh-resource://file/session/...` 地址注册一个内置 `file` 类型，并通过 keyed `sidebar.right.pane.tab` Slot 提供正文。每个可接受地址都会指定资源 Session；解码器会按字面读取编码组件，不应用 WHATWG URL path 归一化，因此相对点路径段仍属于资源 path。正文通过该 Session 解析 path，并执行读取、写入、viewer 加载、文件树操作、引用与对话插入。官方 occurrence 的 Session 仍是显示宿主，负责替换、新建标签、分栏、payload、行导航、文件树显露、编辑器保留状态与 mutation 协调。系统 path 打开和排队的 `sidebar_open` 请求会让同一个 Session 同时充当资源 owner 与显示宿主；嵌入式 Side Chat 的链接和 produced-file 行则会在 parent 的可见 workbench 内保留 child 资源 owner。文件树保留搜索、显露、重命名、删除、上传、打开方式、工作空间围栏，以及合并或分离编辑器行为。未保存草稿、编辑模式、HTML 解锁和滚动状态归官方 occurrence 所有，直到其 signal 中止；真正关闭含脏草稿的标签前会请求确认（[文件宿主决策](../../../.agents/notes/implemented/feature/2026-09-09-official-sidebar-better-file-host.zh.md)、[嵌入式归属](../../../.agents/notes/implemented/bug-fix/2026-09-10-side-chat-resource-display-ownership.zh.md)）。

六个与渲染器无关的 viewer definition 分别选择图片、PDF、Markdown、HTML、代码与二进制下载正文。图片与 PDF 使用有界媒体路由；文本 viewer 使用受围栏约束的文件读取路由；二进制结果会先用头字节重新匹配，再进入代码回退。HTML 通过 Host 预览路由在 opaque-origin sandbox 中加载，除非官方警告设置允许该 occurrence 使用不安全模式。Viewer 启用状态、HTML 安全设置、打开方式数据、编辑器布局与工作空间围栏均使用官方 Sidebar 偏好 owner。

新 Session 打开官方指南；保留的文件变动、任务管理、侧边对话、终端与浏览器 definition 会为引导卡提供描述，这些卡与官方 `+` 菜单来自同一份 definition 清单。选择「文件」会打开资源导航使用的同一个官方 `file` 类型。成员提问材料芯片会用 receiving Session id 与 receiver 所有的隐藏 Workspace path，通过 `ctx.sidebarRight.forSession(sessionId)` 打开 `fileAddressFor` 资源；Markdown 与沙箱 HTML 使用官方文件宿主，组合中没有文件类型时回退到 Host 系统打开器（[决策](../../../.agents/notes/implemented/architecture/2026-09-03-member-question-files-sidebar.zh.md)）。

Session 工作目录、Changes 工具事件视图及 Side Chat preset 或模型恢复所需的冷 Host 读取使用正式 Session Persistence `open(id, 'read')` 句柄，并在继续执行路由专属工作前释放句柄。Side Chat 只从 `inheritedEventCount` 标出的精确 child-owned 后缀折叠持久模型状态，在为冷身份保留模型选择前使用 `stat` 检查其存在性，并仅在关闭时使用 `list` 报告持久化发布状态。Changes 视图把缺失或不可读的冷日志映射为空窗口；工作目录与 Side Chat 失败仍是明确的 API 错误（[决策](../../../.agents/notes/implemented/bug-fix/2026-09-08-better-sidebar-session-persistence-read-handles.zh.md)）。

Side Chat 标签页以临时子 Session id 挂载本仓的 `main.conversation` 内容 entry，并把 parent 作为显示宿主。空白草稿仍使用 active Conversation 布局，composer 位于底部；该 entry 不会嵌套应用或 workbench chrome。临时行会立即携带保留的 `Side: ` 标题，因此列表分类器与 subagent 自动激活不会把草稿误判为委派任务；其临时标记还会让它在发布前保持在父会话后代计数之外。打开标签页不会创建 Host Session 或 Agent；首次提交消息时才会以该 id 原子创建二者、捕获父会话历史、安装所选模型并准入提示词。因此，已注册的对话/轨迹视图、会话操作、transcript 与 InputBar 都和主会话复用同一批组件。标签页外壳只持有子会话创建与生命周期，不提供标签页内的线程切换、新建或提升工具栏。其准入适配器持有提示词、取消、queue/steer、权限、skill（技能） catalog 与模型路由，通用 Session RPC 因而不会绕过 subagent 归属。该适配器会让每个 prompt 的 `requestId` 经首次联系与后续 queue/steer 准入进入子会话 user source 的 `rpcId`，使本地提交回显在持久化投影出现时退休。模型路由检查 Side Chat 的有效选择与可路由状态，共享 Host catalog 则提供按提供方分组的目录；草稿检查以在线父会话定址，发布后的检查以子会话定址。临时状态下的权限命令通过在线父会话的普通命令路由执行，未来子会话会在首次准入时继承该选择；发布后，Side Chat 路由会把每次权限变更同时应用到父会话与子会话。Side Chat 会话头省略 Session 标题、面包屑导航与 agent preset 标签，同时保留视图标签页、当前 Side Chat 的下级目录，以及按子会话确定范围的 schedule 和后台任务。选择下级会重定向同一个 Side Chat 标签页，而不会改变外壳选中的 Session。普通页头目录里持久化标题以 `Side: ` 开头的行会在普通 owner 上打开或聚焦该 Side Chat 标签页，不改变外壳选中项；`createTab` 会复用显式 `openTab` seed，因此恢复与目录打开共用同一身份。标签页会保留根 child id，以便关闭时仍释放归属方持有的在线句柄。头部操作紧随「轨迹」，任务弹层通过 viewport portal 向左展开，避免被窄侧栏裁切。Session constructor 只接收捕获的 parent 前缀并把它标记为继承内容；setup 会把 child descriptor 追加为第一条自有事件，因此持久父地址保持有效，而 `owned-suffix` 只会在子会话 transcript 中隐藏该继承前缀。workbench terminal 标签页仍由自身的 `SessionScope` 确定范围，不会因嵌入式会话而重定向（[决策](../../../.agents/notes/implemented/bug-fix/2026-09-10-side-chat-resource-display-ownership.zh.md)）。

Side Chat 标签页可在 Host 重启后恢复。线程是持久化子 Session，而标签条存放在按 origin 隔离的 localStorage 中，因此新 origin 可能丢失标签条，但不会丢失线程。当某个 Session 的侧栏状态激活时，标签条会恢复所有已发布、未归档且尚无标签页的直属 Side Chat 子线程。冷 child 的 Session summary 没有标题投影时，会使用匹配的直属父目录标签完成保留 `Side: ` 分类并生成标签页标题。恢复的标签页落在活动 pane 中，但不会替换原有活动标签；空白子线程和仅存在于渲染器侧的临时身份不会恢复。恢复的线程使用最新的子会话自有请求所记录的模型路由；尚无请求时回退到创建 descriptor，临时草稿则仍读取在线父会话的路由。Host 会让关闭操作与已准入的首次提示词串行执行，从在线与持久化 Session 存储判断发布结果，并释放在线句柄。客户端归档已发布的 Session，但不删除日志；尚未发送内容的草稿没有需要归档的 Session。只有这些操作成功后才会关闭标签页；失败会被报告，标签页仍保持打开。插件卸载会等待在途关闭，但不会允许它们延迟提交浏览器状态。随后，本地墓碑会在归档投影到达前阻止列表刷新重新打开标签页。`?dsh-sidebar-reset` 逃逸参数会在本次加载中跳过恢复。

文件树重命名拒绝覆盖已有目标；删除是永久操作，并保护工作空间根目录。变更预览提供阅读模式并默认脱敏秘密内容。终端设置支持带引号的 shell 路径与参数；`terminal_wait_for` 按 JavaScript 正则表达式搜索并返回实际匹配文本，无效正则按字面匹配。Terminal 根节点选择 DockKit 的滚动所有权，让 xterm viewport 保持为唯一的纵向滚动容器。

<a id="model-experience"></a>
## 模型体验

### Side Chat

#### 模型看到的内容

持久化子 Agent 会收到首次提交问题时捕获的父会话日志，随后是一条带插件来源标记的上下文注入，其中包含侧边对话边界与可选的父会话进行中输出快照。第一次提问在同一次准入中位于该注入之后。每次插件激活持有自己的 Side Chat 活跃句柄：卸载会关闭路由准入、等待已接纳调用完成，并释放全部句柄，同时保留持久化历史。

#### Token 影响

子请求包含继承的父会话日志、边界注入与 Side Chat 问题。

#### KV Cache 影响

继承的父会话历史仍是可复用前缀；边界注入与第一次提问从该前缀之后开始分叉。

### 可选侧栏打开工具

#### 模型看到的内容

当 Side Card 设置 `agentOpenTools` 打开时，快照宿主会加入 `sidebar_open` 工具 schema。该工具接受一个本地文件、本地文件夹或 HTTP(S) 页面，并以发起调用的 Session 为目标；该 Session 的侧栏视图未连接时，请求会保持排队。设置关闭时，该工具始终不出现。

#### Token 影响

启用该设置会向后续请求加入 `sidebar_open` 工具 schema。

#### KV Cache 影响

`agentOpenTools` 关闭时无影响。启用它会使未包含该工具 schema 的已缓存请求前缀失效。

### 可选终端工具

#### 模型看到的内容

当 Side Card 设置 `agentTerminalTools` 打开时，快照宿主会加入可选的 `terminal_*` 工具 schema。在该设置启用前，这些工具始终不出现。

#### Token 影响

启用该设置会向后续请求加入可选工具 schema。

#### KV Cache 影响

`agentTerminalTools` 关闭时无影响。启用它会使未包含可选工具 schema 的已缓存请求前缀失效。

## 已知限制与延期工作
<a id="known-limitations-and-deferred-work"></a>

- **快照仍带 iframe 浏览器实现** — 产品组合通过 `workbenchBrowser` 替换它所渲染的 chrome；独立安装快照时仍使用 iframe。
- **宿主 fs/git/pty 路由是快照自有栈** — 尚未消费本仓的 `fs` 或 `terminal` 能力缝。
- **右侧 overlay 与官方 details Dock 可能同时绘制** — 布局合一延期。

本包不发布运行时不变式配套插件，因为 Host effect 与 Client 注册表只能通过各自的所属服务观察，没有独立发布的第二份观察。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>

---
description: "官方 Session workbench：右侧与底部 DockKit 表面、全局偏好、descriptor 与 viewer 清单、持久化、导航和关闭生命周期。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right

[English](README.md) | 中文

## 概述

本包拥有官方的逐 Session workbench，以及其全局偏好的唯一浏览器投影。一个 Session 作用域的 `workbench` 席位持有右侧与底部 DockKit 布局、浮动 pane、持久 tab payload 与 pin、occurrence 生命周期、导航及关闭协调。它把两个停靠表面 portal 到 `ui-layout` 提供的稳定宿主；conversation header 的 corner slot 则提供右侧表面的展开按钮。

## 目录

- [所有权与呈现](#ownership-and-presentation)
- [状态与持久化](#state-and-persistence)
- [Descriptor 与 viewer 清单](#descriptor-and-viewer-inventories)
- [全局偏好与 frame](#global-preferences-and-frame)
- [`ctx.sidebarRight`](#ctxsidebarright)
- [关闭生命周期](#close-lifecycle)
- [Tab 域](#the-tab-domain)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="ownership-and-presentation"></a>
## 所有权与呈现

`ui-dockkit` 仍是纯布局引擎。本包为 tab kind 赋予产品含义、用引导页播种空 pane、通过 keyed slot 渲染 tab 正文，并拥有跨组件重挂载保留的状态。右侧、底部与浮动呈现共享一个 id 游标和一个 occurrence 域，因此一条记录在完整 Session workbench 中只有一个身份。

workbench 在框架挂载后解析 `rightHostId` 与 `bottomHostId`，随后从同一棵 React 与 store 树 portal 两个表面。右侧表面支持 push、保留底层轨道的宽屏全屏、低于 768px 的自动全屏、两个横向 pane 及浮动面板。在 Desktop Window Chrome 中，它的顶部条只把未占用区域留作窗口拖动区，而 tab、添加、拆分、全屏和收起控件均显式保留为指针目标。底部表面拥有独立的 split tree、高度、打开状态和全屏模式。它的 push 呈现只占用中栏；全屏时不占中栏行高。底部表面拥有顶部高度拖动，以及同时修改底部高度与右侧宽度的共享角落手势。底部 tab 不会创建 float。

右侧、底部、全屏和浮动 workbench 根会消费外部 OS 文件拖动的完整 enter、over、leave 与 drop 事件序列，阻止事件到达 document 级 composer 导入处理。根级 shield 在冒泡阶段处理事件，因此 Files 正文会先收到自己的 drop。非文件拖动继续传播给 DockKit 和其他 owner。

右侧表面收起后仍保持挂载。它的展开控件位于 `conversation.session.header.corner` 并共享 Session store。没有当前 Session 时，两个表面均不挂载。frame 只接受一次初始宽度：若保留的 `dsh-sidebar:v1:width` 存在则优先采用，否则由 `defaultWidthPercent` 提供。读取这个旧值不会修改或删除回滚 key。

Dock 添加控件在 Web 模式下打开引导页。内置引导页与 Desktop 原生 overlay 菜单投影同一组可观察页面 definition，并排除引导页、隐藏类型与资源类型。每张引导卡默认从对应 definition 读取顺序、标题与图标；可选引导元数据提供描述或额外卡片。不可用条目保持可见并禁用，同时显示原因。用户选择后，系统通过 `ctx.sidebarRight` 在提供锚点的控件所属 pane 中打开页面。

<a id="state-and-persistence"></a>
## 状态与持久化

每个 Session 拥有两个 `DockSurfaceState`、一个共享的 id 生成游标、底部高度和首次打开标记、逐 tab 的 payload 与 pin 元数据，以及按命名空间保存的 JSON 数据。store action 使用 DockKit planner，并把两个表面原子提交给 Tab 域。两个表面出现重复 tab id 时会拒绝发布，而不是发布不完整的 occurrence 集合。全新且无持久状态的 Session 读取 `openByDefault`；窄屏仍从收起状态开始。已恢复或已迁移 Session 保留记录的展开状态。

浏览器适配器存储 `dsh-sidebar-workbench:v1:<sessionId>`。版本化 codec 校验完整布局图、tab 元数据、底部几何和 JSON 数据。可逆布局历史只在进程内保留。未知版本或畸形官方文档会原样保留，并阻止自动覆盖，以便恢复。

不存在官方文档时，适配器可以采用 Better Sidebar 的 `dsh-sidebar:v1:<sessionId>`。转换会在右侧、底部和 float 之间重新生成唯一 id，保留未知 tab kind 与 JSON 元数据，转换 Terminal pin，并把选定的旧 tombstone 与计数数据保存在 `legacy.ui-better-sidebar` 下。官方文档写入成功后才会被采用。旧 key 保持逐字节可用以便回滚。写入失败时采用全新默认状态，并保持旧文档不变。

<a id="descriptor-and-viewer-inventories"></a>
## Descriptor 与 viewer 清单

一个 tab 类型在同一个 effect 中完成两阶段注册：

1. `ctx.sidebarRightTabs.register(definition)` 声明路由、初始标题、清单顺序/隐藏状态/icon、可用性、badge、单例或 keyed 去重、纯创建回调、打开/激活通知、URL 认领、设置行、引导入口与可选的真正关闭生命周期。`onOpen` 只在新 occurrence 提交后运行一次；去重、内容聚焦与 tab 条聚焦运行 `onActivate`。`id` 标识实现，并作为正文注册 key。Definition 只接收 Session、偏好、occurrence、导航、payload 与 pin 事实，不接收 React node、Cordis context 或 store。一个 builtin 与一个 extension 可以共享 kind；extension 注销前始终生效。
2. `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` 提供正文。可选的 `.title` slot 提供实时 chip 标题。`sidebar.right.tab.icon` 与 `sidebar.right.viewer.icon` 接受自定义 keyed icon；当 `settings.custom` 为 true 时，对应的 `.settings` slot 接受自定义设置正文。`props.useTabInfo()` 返回显示表面与 pane，以及权威 record 的 Session、payload、pin、导航、可见性、occurrence signal 和指向 home 的 action。

资源类型声明地址 glob。包含 `:` 的 pattern 匹配完整 URI，其他 pattern 匹配 URI path。候选项依次按 priority 档位、匹配 pattern 长度和注册顺序排序。页面类型不写 pattern，而是按 kind 打开。持久化的未知 kind 通过 unavailable fallback 保持可见，并在其 definition 再次注册后恢复。

文件 viewer 通过 `registerViewer(definition)` 使用同一个生命周期 owner。Viewer 声明稳定 id、文案与 icon token、小写扩展名、数值 priority、获取策略、可选的头字节 detector、可选的可中止 JSON/字节 loader，以及纯设置行。`matchViewer({ address, path, head? })` 按 priority 与注册顺序排序，先尝试每个 viewer 自己的 detector，再检查其扩展名；只有 detector 的 catch-all 在尚无字节时让行，并跳过 `viewersEnabled` 中显式关闭的 id。Viewer 组件仍通过 keyed Slot 贡献；registry 不传递组件。

两种注册方法都返回精确、幂等的 disposer，并进入调用方的 Cordis effect，因此 HMR 只移除自己的贡献。Tab 与 viewer 清单都可订阅。`matchUrlTarget(url)` 按注册顺序检查已启用的 tab definition，并在某个 predicate 抛错后隔离错误、继续匹配。

`SidebarRightTabPayloadMap` 按 kind 通过声明合并扩展。`openTab<K>` 与 `update<K>` 会推导该 kind 的 payload 类型。workbench 在写入 store 前把 payload 快照为无损 JSON，并在加载时再次校验。

<a id="global-preferences-and-frame"></a>
## 全局偏好与 frame

`ctx.sidebarRightPreferences` 是保留的 `dsh-better-sidebar` Host 设置命名空间在浏览器内的唯一 owner。它的稳定 snapshot 包含状态、可写性、revision 与全部 30 个已解析偏好字段。它保留既有 tab/viewer 启用 map 与 descriptor JSON blob；缺失的启用项表示开启。`update`、`setTabEnabled`、`setViewerEnabled` 与 `setPluginSetting` 使用设置域的 path mutation，因此一个 descriptor 不会重述或删除同级 map 项。既有 editor blob 继续通过 `pluginSettings('editor')` 读取；descriptor 可通过 `settings.settingsId` 指向既有 blob，同时保留带包名的 definition id。

`htmlViewerSafety()` 根据两个保留的 HTML 设置向 viewer 代码提供 `{ forceUnsandboxed, defaultUnsandboxed }`。字段缺失或畸形时的安全默认值均为 false。官方 workbench 也拥有 frame 兼容处理：显式 Web 模式关闭适配；否则依次采用 Window Controls Overlay 几何、Desktop URL inset、选定的 DSH Desktop preset 或自定义 inset。自定义 CSS 与兼容标记随官方 workbench effect 安装和清理。

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` 认领一个 `dsh-resource://` 地址并返回 `Promise<TabId>`。`openTab(kind, options?)` 打开已注册的页面类型，也返回最终 occurrence 身份。放置参数支持 `surface`、`paneId`、`replaceTab`、`revealIfOpened` 和 `activate`。`activate: false` 创建或聚焦 occurrence 时不改变 pane focus 或展开状态，且不能与 replace 同用。页面打开还接受 `instanceId`、`title`、类型化 `payload` 和 `pin`；资源打开接受类型化导航 `params`、payload、pin 与显式认领 kind。稳定 instance id 让页面地址可重复；省略时保持单例页面行为。

`forSession(sessionId)` 返回稳定的定向 navigator，并且可以在 slot renderer 尚未访问 Session 时创建其 store。它暴露打开、关闭、更新、命名空间数据和 reset 操作。后台恢复通过这条路径传入 `activate: false`，因此冷 direct child 可以恢复而不抢焦点或展开面板。

`getSnapshot()` 与 `subscribe()` 暴露稳定的产品投影，包括已创建的 Session、已挂载 Session id、左右表面展开状态、底部高度、tab 放置、pane 可见性与聚焦状态、持久元数据、命名空间数据和 pin。consumer 结合 `mountedSessionId` 与 `tab.visible`，可以找出所有 split pane 中当前实际绘制的 active tab；`tab.active` 标识聚焦 pane。官方 seat 会把可见的外部 Session pin 投影到第一个右侧 pane，但不会写入另一条 record：其正文读取 home record、Session id、signal、navigation、payload、pin 与 action。Workspace pin 在当前 Session cwd 完成 hydration 后按 cwd 匹配，global pin 则出现在所有其他 Session 中。DockKit node 与 operation history 保持内部实现。面向已挂载 Session 的 helper 继续提供右侧表面的 focus、split、float、dock、展开与 active-tab 兼容操作。

<a id="close-lifecycle"></a>
## 关闭生命周期

每次真正关闭都经过逐 Session 串行 coordinator。批次会先调用所有 `beforeClose(context)`，再修改布局。返回 `false` 或 rejection 会取消整个批次。准入成功后，每个 `close(context)` 独立结算：已成功完成的记录一起移除，失败记录保留，结果报告两者。Replace、reset、undo、redo 及 tab 菜单的“关闭其他页签”“关闭左侧页签”“关闭右侧页签”操作都使用这条路径。运行时 owner 发起的打开和关闭会为可逆历史建立 checkpoint。

关闭 context 固定原始 Session、表面、记录、payload、pin、signal 和 reason。异步清理期间切换 Session 不会改变目标。重复关闭请求串行执行并读取最新提交记录，因此 owner 只释放一次。组件卸载和 tab 类型注销不是真正关闭，不会调用这些 hook。

pane 相对菜单操作会排除外部 Session 的 pinned view，并保留目标 tab。停靠在右侧的 tab 还可以从菜单移动到浮动面板。底部 tab 和 pinned virtual view 不提供此操作。

<a id="the-tab-domain"></a>
## Tab 域

Tab 域按 `(Session, tab id)` 保留导航、AbortSignal 与绑定 action。store adoption 在每次提交后对账两个布局，包括不可见的 Session。记录移除或插件卸载会中止 occurrence。隐藏表面、切换 Session、改变呈现和正文重挂载都会保留 occurrence。恢复出的记录是新的 occurrence。

`tab.actions` 始终指向该记录自己的 Session 与表面，包括从其他 Session 的 pinned view 调用 `update({ pin: undefined })`。`tab.sessionId` 标识 home Session，`tab.virtual` 标识仅用于显示的投影。`tab.visible` 对已展开停靠表面的 active tab 以及可见的右侧 float 为真。导航 revision 独立于布局历史变化，因此再次打开既有地址可以向正文送达新参数而无需重挂载。

<a id="model-experience"></a>
## 模型体验

无。本包是浏览器 UI 能力，不注册面向模型的工具或提示词。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **官方持久化是 best effort。** 浏览器存储写入失败时，当前内存 Session 仍可使用，但没有面向用户的导出命令。
- **底部 chrome 复用 Sidebar 文案。** 它没有独立的底部产品标签。
- **Undo 控件仍为内部功能。** 支持关闭生命周期的 history 方法只用于测试和未来产品控件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

交付决策与剩余能力矩阵记录在 [将 Sidebar 能力统一到官方 workbench](../../../.agents/notes/proposed/architecture/2026-09-09-official-sidebar-capability-fusion.zh.md) 中。

</details>

**运行时不变式：** 不发布配套入口。注册表与 controller 在同一个插件生命周期内提供。store adoption 是 occurrence 与 projection 对账的权威事件流；包测试直接断言非活动 Session 创建、双表面原子性、持久化选择和关闭结果。

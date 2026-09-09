# 官方 Sidebar Workbench

[English](sidebar-right.md) | 中文

官方 Sidebar workbench 是 Web Client 中按 Session 保存已寻址资源与产品页面的位置。它拥有右侧与底部 DockKit 表面、右侧 float、持久 occurrence 元数据、路由、关闭生命周期和稳定读取投影。[`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) 拥有产品能力；[`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) 仍是其内部布局引擎。

本页定义该子系统的约定。slot 机制见 [Slots 参考](slots.zh.md)，文件值见 [Client Resources](client-resources.zh.md)，完整迁移决策见[将 Sidebar 能力统一到官方 workbench](../../.agents/notes/proposed/architecture/2026-09-09-official-sidebar-capability-fusion.zh.md)。

## 所有权与放置

一个 Session 作用域的 `workbench` entry 拥有两个停靠表面和一个 store 实例。[`ui-layout`](../../packages/client/ui-layout/README.zh.md) 渲染稳定的右侧与底部 DOM 宿主，并通过 `WorkbenchOwnerProps` 传递宿主 id 和框架几何值。workbench 在 layout effect 中解析这些 id，并从一棵 React 树 portal 两个表面。右侧宿主占满框架高度。底部宿主位于中栏内，因此底部轨道只缩短 conversation 行。

| `WorkbenchOwnerProps` 字段 | 含义 |
|---|---|
| `rightHostId`、`bottomHostId` | 框架持有的 DOM 宿主稳定 id。 |
| `viewportWidth`、`viewportHeight` | 框架最后一次有效测量的宽高。 |
| `centerWidth` | 当前轨道预留之后的中栏宽度。 |
| `rightPanelWidth` | 用于绘制右面板的预计普通宽度。 |
| `rightbarWidth` | 右轨道当前预留的宽度；未请求轨道时为零。 |
| `canShowRight` | 普通右面板能否在受保护中栏旁保留最小宽度。 |
| `setRightbarWidth(width)` | workbench 缩放手势使用的框架限制宽度写入。 |
| `seedRightbarWidth(width)` | 一次性初始宽度；播种、打开或拖动后忽略。 |

右侧表面支持 push、保留轨道的宽屏全屏、低于 768px 的自动全屏、两个横向 pane 与 float。底部表面拥有独立 pane、history、高度、展开和全屏状态。底部全屏预留零行高，底部 tab 不会浮出。两个表面共享一个 id 生成游标和 occurrence 域。

## 地址与身份

资源地址是 `dsh-resource://<type>/…` URL。小写 host 是 `ResourceProtocolMap` 的 key，其余部分归该协议所有。`fileAddressFor(sessionId, cwd, path)` 构建文件地址，`parseFileAddress(address)` 读取它（见[语法](../../packages/util/workspace-path/README.zh.md)）。只要 `useResource` 订阅方或 occurrence pin 仍持有地址，资源模型就会为该地址保留一个实时值。

页面按 kind 打开。`openTab(kind)` 记录不透明的单例地址 `sidebar://<kind>`。`openTab(kind, { instanceId })` 记录 `sidebar://<kind>/<encoded-instance-id>`，从而提供稳定的多实例身份。调用方提供 kind 与可选 instance id，不自行拼接这些地址。

一个 occurrence 是带唯一 `TabId` 的一条 tab 记录。`revealIfOpened: true` 聚焦具有相同 kind 与内容身份的既有记录；`false` 创建另一个 occurrence。右侧、底部与 float 共用 id 空间，持久化 decoder 会拒绝重复值。

## Tab 类型注册

`ctx.sidebarRightTabs.register(definition)` 在调用方 effect 生命周期内注册一个实现并返回 disposer。一个 builtin 与一个 extension 可以共享 kind；extension 注销前始终生效。重复 definition id 或其他 kind 冲突会抛错。

| `SidebarRightTabDefinition` 字段 | 含义 |
|---|---|
| `id` | 全局唯一实现身份，也是 keyed 正文与标题的注册 key。 |
| `kind` | `openTab` 点名并存入记录的页面或资源判别值。 |
| `order`、`hidden`、`icon` | 添加/设置清单顺序、普通 action 可见性与不依赖 renderer 的 icon token。 |
| `patterns` | 可选资源地址 glob。页面类型省略此字段。 |
| `priority` | `extension`、`builtin` 或 `fallback`；省略时为 `extension`。 |
| `canOpen(address)` | 资源 pattern 匹配后的可选同步否决。 |
| `title(address)` | occurrence 打开时写入记录的初始标题。 |
| `available(context)` | 添加 action 使用的纯可用性提示。直接导航仍是权威路径。 |
| `single`、`dedupeKey(tab)` | 跨右侧、底部与 float 的 definition 单例或 keyed occurrence 身份。 |
| `create(request)` | 放置前纯粹确定 identity/title/payload；`false` 拒绝创建。 |
| `onOpen(tab, context)` | 新 occurrence 提交后的通知，每次创建只运行一次。 |
| `onActivate(tab, context)` | 去重、内容聚焦或 tab 条聚焦后的通知。 |
| `badge(tab, context)` | 纯 tab 条 badge 值。 |
| `settings` | 声明式 preference/plugin row 与可选 keyed 自定义设置正文。 |
| `urlTarget(url)` | 有序外部 URL 认领；抛错的 predicate 被隔离。 |
| `guide` | 可选的有序引导入口。 |
| `beforeClose(context)` | 可选异步准入。返回 `false` 或 rejection 会取消整个批次。 |
| `close(context)` | 可选异步 owner 释放。rejection 会保留该记录。 |

资源候选依次按 priority 档位、最长匹配 pattern 和注册顺序排列。包含 `:` 的 pattern 匹配完整地址，其他 pattern 匹配 URI path。点名 kind 会跳过 pattern 排序，但仍运行 `canOpen`。

definition 的正文使用 `key: definition.id` 注册到 `sidebar.right.pane.tab`；实时标题可以注册到 `sidebar.right.pane.tab.title`。`sidebar.right.tab.guide` 是替换内置引导正文的 chain。`sidebar.right.tab.menu.item` 在 DockKit 布局 action 后追加内容 action。

`sidebar.right.tab.icon` 与 `sidebar.right.viewer.icon` 是 keyed 自定义 icon slot。当 descriptor 声明 `settings.custom` 时，对应 `.settings` slot 提供自定义设置正文；不依赖 renderer 的字符串 icon 与声明式 row 仍保存在 registry。菜单 entry 收到权威 home `sessionId`、surface、record、payload、pin 与 tab action，包括从外部 Session view 解除 pin 所需的 `update`。

`registerViewer(definition)` 持有文件 viewer 清单。Viewer 声明稳定 id、文案/icon token、小写扩展名、数值 priority、获取策略、可选头部字节 detector、可选的可中止 JSON/字节 loader 与 settings。`matchViewer` 按 priority 和注册顺序排序，先运行每个 viewer 自己的 detector，再检查其扩展名；仅 detector 的 catch-all 等待字节，并跳过显式关闭的 viewer id。

`useTabInfo()` 返回 `workbench.surface`、右侧 Sidebar 呈现、所在 pane 和 occurrence。occurrence 包含记录、可见性、导航、持久 `payload`、可选 `pin`、`AbortSignal` 与 Session 绑定 action。kind 通过扩展 `SidebarRightTabPayloadMap` 为 `openTab<K>` 和 `update<K>` 的 payload 定型。该值必须是无损 JSON。

## 导航与投影

`ctx.sidebarRight` 暴露下表中的已挂载 Session 命令。`forSession(sessionId)` 返回定向到显式 Session 的同组状态操作，并能在首次渲染前创建其 store。

| 操作 | 结果与行为 |
|---|---|
| `openResource(address, options?)` | 返回 `Promise<TabId>`；认领资源、放置或聚焦、展开所选表面并记录导航参数。 |
| `openTab(kind, options?)` | 返回 `Promise<TabId>`；打开单例页面或调用方标识的页面实例。 |
| `close(tabId)` | 返回 `Promise<SidebarRightCloseOutcome>`，包含准入结果、已关闭 id 与释放失败。 |
| `update(tabId, patch)` | 替换标题、类型化 JSON payload 或 pin，不改变 occurrence 身份。 |
| `setData(key, value)` | 存储或删除带命名空间的 Session JSON。 |
| `reset()` | 通过生命周期 hook 关闭全部现有 occurrence；全部释放成功后创建全新表面。 |

放置参数包括 `surface`、`paneId`、`replaceTab`、`revealIfOpened` 与 `activate`。`activate: false` 创建或聚焦时不改变 focus 或展开状态，且不能替换 tab；冷恢复使用这条路径。资源参数还包括认领 `kind`、类型化 `params`、payload 和 pin。页面参数还包括 `instanceId`、标题、类型化 payload 和 pin。替换 tab 会等待其关闭结果，再提交新的 occurrence。

`getSnapshot()` 与 `subscribe()` 暴露 `SidebarRightProjection`：已创建的 Session、`mountedSessionId`、右侧和底部展开状态、底部高度、命名空间数据、pin，以及每个 tab 的 Session、表面、pane、floating、visible 与 active 标志、record 和持久状态。`visible` 表示记录是其 pane 当前选中的 tab，并且所在表面已展开，或者它是右侧 float；consumer 将它与 `mountedSessionId` 结合以选择当前实际渲染内容。`active` 还要求该 pane 获得焦点。官方 seat 把可见的外部 Session pin 投影到 viewer 的第一个右侧 pane，但不存储另一条 record。`useTabInfo().tab` 暴露权威 home Session、occurrence 和 `virtual` 标记；global pin 出现在每个其他 Session，workspace pin 在 hydration 后按 viewer cwd 匹配。DockKit node 与 operation history 不公开。面向已挂载 Session 的兼容方法继续提供右侧 active、展开、focus、split、float 与 dock 行为。

## 关闭与 occurrence 生命周期

每个 Session 的一个串行 coordinator 拥有所有记录移除事务。它在状态变更前完成全部准入。准入成功后，owner 释放独立结算；成功记录一起提交，失败记录保留。Close、replace、reset、undo 与 redo 在移除记录时使用同一个 coordinator。运行时 owner 相关变更会建立 history checkpoint，因此可逆布局操作不会重放已释放的外部 owner。

`SidebarRightTabCloseContext` 包含原始 `sessionId`、`surface`、tab record、payload、pin、occurrence signal 与 reason（`close`、`replace`、`reset`、`undo` 或 `redo`）。Session 切换不会改变正在等待的清理目标。重复请求根据最新已提交状态串行处理。

store adoption 在每次提交后对账两个布局，包括尚未渲染的 Session。记录消失或插件卸载时 occurrence signal 中止。隐藏、Session 切换、split、float、全屏与正文重挂载不会中止 signal。definition 卸载后显示 unavailable fallback，同时保留记录与 payload；这不属于用户关闭。

## 全局偏好与 frame

`ctx.sidebarRightPreferences` 是保留的 `dsh-better-sidebar` settings namespace 的唯一浏览器 owner。`getSnapshot()` 返回 `{ status, preferences, revision, writable }`；完整值包含 30 个已迁移字段。缺失的 tab/viewer enable 项表示启用。Preference、enablement、viewer safety 与 descriptor plugin 读取都使用这个 face，而 path mutation 会保留同级 map/blob 项。既有 blob 可以通过 `settings.settingsId` 继续保留在 `editor` 等旧 key 下。

官方 workbench 也应用 frame preference。显式 Web 模式关闭适配；否则依次采用 Window Controls Overlay 几何、Desktop URL inset、选定的 DSH Desktop preset 或自定义 inset。自定义 CSS 与兼容 marker 只有一个 effect-scope owner。frame 只从只读旧值 `dsh-sidebar:v1:width` 或 `defaultWidthPercent` 播种一次宽度；旧值保持不变用于回滚。

## 持久化

官方文档 key 是 `dsh-sidebar-workbench:v1:<sessionId>`。codec 存储两个布局、float、共享生成计数、底部高度与首次打开标记、逐 tab payload 与 pin，以及命名空间 JSON。history 在进程启动时重置。未知版本或畸形官方文档保持原样，并阻止自动覆盖。

官方 key 缺失时，适配器可以转换 `dsh-sidebar:v1:<sessionId>`。它在右侧、底部与 float 间重新生成 id，保留未知 kind 与 JSON 元数据，转换受支持的 pin，并把选定的 Better tombstone 与计数数据保存到命名空间 JSON key。它先写入官方文档再选用，并且绝不删除或改写旧 key。写入失败时，本进程使用全新状态并保持回滚数据不变。

## 相关包

- [`ui-sidebar-textpreview`](../../packages/client/ui-sidebar-textpreview/README.zh.md) 注册 fallback `text` 资源类型。
- [`ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.zh.md) 注册 `files` 页面。
- [`api/workspace-files`](../../packages/api/workspace-files/README.zh.md) 提供有界文件元数据、文本、字节、目录列表和变更流。
- [`resources`](../../packages/client/resources/README.zh.md) 拥有资源 provider、缓存与持有者生命周期。

## 当前限制

- Better Sidebar 能力迁移尚未完成，因此其 consumer 与 runtime tab 迁移前，产品组合仍有第二个 workbench owner。
- 官方文档使用浏览器本地 best-effort 持久化，尚无面向用户的 import/export 命令。
- 底部专用文案、首次打开 Terminal 策略、descriptor 呈现、viewer 正文、settings UI 与 runtime tab consumer 留待能力迁移。
- 关闭失败会返回调用方；尚未注册统一的面向用户错误呈现。

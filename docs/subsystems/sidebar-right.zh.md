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

一个 tab 类型是共用定义 `id` 的两次注册：在 `ctx.sidebarRightTabs` 里的静态定义说明其 `kind` 打开哪些地址，一次 keyed slot 注册提供它的正文。框架注入 `useTabInfo()` 以读取 Sidebar、窗格和标签的实时信息；各类型把自身状态放在 slot store 里。各包之间只以类型形式引用彼此的声明。

| 包 | 职责 |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) | 面板与栏席位、布局 store、`ctx.sidebarRightTabs`、`ctx.sidebarRight`、Tab 域、引导类型 |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) | 纯布局引擎与 React 面；`ui-sidebar-right` 的内部依赖，不是稳定接口 |
| [`client/resources`](../../packages/client/resources/README.zh.md) | `ctx.resources`、`useResource`、协议 → 值类型的花名册 `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.zh.md) | Host `ctx.workspaceFiles`、`workspaceFiles` Remote 命名空间与 Client `file` 资源提供者 |
| [`util/workspace-path`](../../packages/util/workspace-path/README.zh.md) | 文件地址语法：`fileAddressFor`、`parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.zh.md)、[`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.zh.md) | 内置的 `text` 与 `files` 类型 |

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

## Slot 与 owner props

Sidebar 声明四个扩展 slot；其文档 tab 另行声明下表中的 keyed 文档正文 slot（[层级](slots.zh.md)）。

| Slot | Cardinality | 用途 |
|---|---|---|
| `sidebar.right.pane.tab` | 按定义的 `id` keyed，会话作用域 | 一个 tab 的正文。席位把 tab 分发到其 kind 生效实现的 `id`，因此注册者收到该 kind 的每个 tab，停靠或浮窗。实现没有注册正文的 kind 渲染 owner 的「无法查看此内容」提示。 |
| `sidebar.right.pane.tab.title` | 按定义的 `id` keyed，会话作用域 | chip 的标题，owner share 与正文相同。可选：没有条目时 chip 显示打开时捕获的 `title(address)` 文本；有活标题的类型在此读自己的 store。 |
| `sidebar.right.tab.guide` | chain，会话作用域 | 替换引导 tab 的内容而不替换 tab；第一个不拒绝的条目接管正文，否则渲染自带引导。 |
| `sidebar.right.tab.menu.item` | list，会话作用域 | 追加在 kit 自身布局动作之后的内容级动作。执行了动作的条目必须调用 owner 的 `dismiss()`。 |
| `sidebar.right.tab.document` | 按文档实现的 `id` keyed，会话作用域 | 文档 tab 内选中的文件渲染器；父组件拥有共享加载与工具栏控件。 |

## 关闭与 occurrence 生命周期

每个 Session 的一个串行 coordinator 拥有所有记录移除事务。它在状态变更前完成全部准入。准入成功后，owner 释放独立结算；成功记录一起提交，失败记录保留。Close、replace、reset、undo 与 redo 在移除记录时使用同一个 coordinator。运行时 owner 相关变更会建立 history checkpoint，因此可逆布局操作不会重放已释放的外部 owner。

`SidebarRightTabCloseContext` 包含原始 `sessionId`、`surface`、tab record、payload、pin、occurrence signal 与 reason（`close`、`replace`、`reset`、`undo` 或 `redo`）。Session 切换不会改变正在等待的清理目标。重复请求根据最新已提交状态串行处理。

store adoption 在每次提交后对账两个布局，包括尚未渲染的 Session。记录消失或插件卸载时 occurrence signal 中止。隐藏、Session 切换、split、float、全屏与正文重挂载不会中止 signal。definition 卸载后显示 unavailable fallback，同时保留记录与 payload；这不属于用户关闭。

## 全局偏好与 frame

`ctx.sidebarRightPreferences` 是保留的 `dsh-better-sidebar` settings namespace 的唯一浏览器 owner。`getSnapshot()` 返回 `{ status, preferences, revision, writable }`；完整值包含 30 个已迁移字段。缺失的 tab/viewer enable 项表示启用。Preference、enablement、viewer safety 与 descriptor plugin 读取都使用这个 face，而 path mutation 会保留同级 map/blob 项。既有 blob 可以通过 `settings.settingsId` 继续保留在 `editor` 等旧 key 下。

官方 workbench 也应用 frame preference。显式 Web 模式关闭适配；否则依次采用 Window Controls Overlay 几何、Desktop URL inset、选定的 DSH Desktop preset 或自定义 inset。自定义 CSS 与兼容 marker 只有一个 effect-scope owner。frame 只从只读旧值 `dsh-sidebar:v1:width` 或 `defaultWidthPercent` 播种一次宽度；旧值保持不变用于回滚。

## 文档渲染器

`text` tab 是共享的 Document Preview 所有者。其[根注册](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts)声明 `sidebar.right.tab.document` 并提供 `ctx.documentPreviews`。渲染器在自己的 effect 中注册 `DocumentPreviewDefinition` 元数据，再通过 `ctx.slots.inject('sidebar.right.tab.document', ...)` 等待 slot，以 `key: definition.id` 和自己的 locale 命名空间注册组件。切换渲染器不改变 tab 或资源地址；[扩展决议](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)将预览策略与资源归属分开。

[注册表](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts)记录唯一的 `id`、`extensions`、本地化 `title()`、`loading`，以及可选的 `priority` 和 `wrap`。后缀匹配不区分大小写，先排 `extension`（缺省值）、再排 `builtin`，随后比较后缀长度（长者优先）与注册顺序。与 tab kind 替换不同，注册表保留所有实现；工具栏列出匹配的候选，按 tab 记住选择。未知扩展名使用纯文本。`loading` 为 `text-pages` 或 `bytes-complete`；`wrap` 声明是否支持共享的源码换行控件。

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) 派生自 `PropsRuntime<'sidebar.right.tab.document'>`。owner 提供原始 `resourceAddress`、`content` 与当前 `wrap`：文本内容为 `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }`，其中 `text` 为累积文本；完整字节为 `{ kind: 'bytes', data }`，其中 `data` 为 `Uint8Array<ArrayBuffer>`。这些瞬时缓冲区按只读方式借用，不得进入持久布局或 Session JSON。PDF 在转移到 Worker 前复制字节，以保留 owner 的缓冲区。子组件收到同一个框架绑定的 `useTabInfo`，以及全局共享、仅提供元数据的 `useResource`。父组件通过普通 inject 回调调用 `remote.workspaceFiles.read`/`readAll`，拥有追加分页、逐 tab 刷新与加载状态。HTML 自己的 inject 回调使用 `readRelated`；路径由 Host 代码解析。Markdown 和代码在追加期间保留同一个增量渲染器，到 EOF 完成最终解析；HTML 和 PDF 接收完整字节。

Preview 记录已载入版本和读取开始时的观察版本。刷新只重读当前 tab，不改变共享元数据或其他 tab 的内容。读取不具备事务性；版本是不透明的相等性令牌，不是可排序的时间戳（[资源观察与 Preview RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)）。

## 资源模型

模型本身见[客户端资源](client-resources.zh.md)；本节只写 Sidebar 依赖的部分。一份资源是一个地址，资源地址是 `dsh-resource://<type>/…` 形式的 URL，小写 host 即协议键。协议所属的客户端包用 `ctx.resources.register(provider)` 在自身生命周期内注册唯一的提供方；同一协议的第二个提供方抛错（[提供协议](../../packages/client/resources/README.zh.md#provide-a-protocol)）。提供方是 `{ protocol, open(address, { signal }) }`：`open` 产出 `RemoteResult` 帧——首帧是当前状态，之后每次变化一帧——并在 `signal` 中止时停下；失败是 `{ ok: false, error }` 帧而不是抛错，流里抛出的东西是编程错误，模型不捕获。

`useResource<P>(address)` 是每个 slot 组件都有的全局标准 prop，不论作用域。它返回 `{ status, value, failure }`：地址协议没有提供方或地址不是资源地址（`sidebar://guide` 不指向资源）时为 `none`，首帧之前为 `loading`，`live` 携带最新 `ok` 值，`failed` 在最后一个值旁携带最新帧的失败。（[读取资源](../../packages/client/resources/README.zh.md#read-a-resource)）。

资源有持有者就保持打开——订阅中的 `useResource` 或一次 `ctx.resources.pin(address, signal)`；第一个持有者打开提供方的流，之后的持有者共享它并立刻读到最新值，最后一个释放时中止流并丢弃值。流只推元数据不推内容：`file` 的值是 `{ absolutePath, version, bytes? }`，消费方自己经 Workspace Files 服务按页读文件文本（[生命周期](../../packages/client/resources/README.zh.md#lifecycle)）。

## 持久化

官方文档 key 是 `dsh-sidebar-workbench:v1:<sessionId>`。codec 存储两个布局、float、共享生成计数、底部高度与首次打开标记、逐 tab payload 与 pin，以及命名空间 JSON。history 在进程启动时重置。未知版本或畸形官方文档保持原样，并阻止自动覆盖。

官方 key 缺失时，适配器可以转换 `dsh-sidebar:v1:<sessionId>`。它在右侧、底部与 float 间重新生成 id，保留未知 kind 与 JSON 元数据，转换受支持的 pin，并把选定的 Better tombstone 与计数数据保存到命名空间 JSON key。它先写入官方文档再选用，并且绝不删除或改写旧 key。写入失败时，本进程使用全新状态并保持回滚数据不变。

## Workspace Files

Host 的 `ctx.workspaceFiles` 服务与生成的 `workspaceFiles` Remote 命名空间读取 Session 文件系统后端允许的文件：`stat(path)` 返回 `{ absolutePath, version, bytes? }`；`read(path, { offset?, limit? })` 返回一页行（`offset` 1 起，`limit` 受配置页长限制），形如 `{ …stat, offset, text, eof }`；`readBytes(path, { offset?, length? })` 返回一个原始字节窗口（`offset` 0 起，`length` 受配置字节上限限制），形如 base64 的 `{ …stat, offset, data, eof }`、不做文本解码。`list(path)` 仍限定在工作区根内，返回目录的直接子项（`name`、`type: 'file' | 'directory' | 'other'`、`size?`），按配置上限截断并置 `truncated`。`changes()` 同样限定于工作区，订阅就绪后产出 `{ kind: 'ready' }`，随后产出 `{ kind: 'change', change }` 帧，其载荷为 `{ absolutePath, version }` 或 `{ absolutePath, absent: true }`（[README](../../packages/api/workspace-files/README.zh.md#use-this-package)）。文件操作拒绝末端符号链接并执行传输上限；`read` 还要求 UTF-8 文本。失败使用 `workspace-file/*` 错误码（[失败](../../packages/api/workspace-files/README.zh.md)）。

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) 注册 `file` 提供方，`ResourceProtocolMap.file` 直接是 `WorkspaceFileStat`。Session 地址携带授权 Session 与相对或绝对路径，Host 原样接收并解析。提供方在 stat 前等待 Host 的 `ready` 帧，并按 `stat.absolutePath` 过滤变更。裸 `absolute` 地址没有授权 Session，以 `workspace-file/unknown-workspace` 失败，不借用当前或 Tab Session。任何 UI（包括 Global）访问同一完整地址都共享观察。Preview 的普通 Remote 回调使用地址中的 Session；Host `readAll` 和 `readRelated` 保留，字节结果由 Preview 的 `rpc.ts` 解码。

## 内置类型

- **`guide`**——`builtin`，以 `openTab('guide')` 打开。居中标题、一行说明，以及已注册类型贡献的每个 `guide` 入口一框、按 `order` 排列；点一框即在引导 tab 的位置把贡献它的类型作为页面打开。每个 pane 最多一个引导 tab，tab 条的新增控件只在本 pane 没有引导时出现。新 pane 使用已注册的默认页：只有一个引导入口时直接使用该入口，否则使用引导页（[引导](../../packages/client/ui-sidebar-right/README.zh.md#ownership-and-presentation)）。
- **`text`**——`fallback`，`dsh-resource://file/**`，只认领 Session 地址。Document Preview 通过 `useResource<'file'>` 观察元数据，经 Remote 回调加载内容，并拥有渲染器选择、工具栏、逐 tab 刷新、滚动与源码定位；未知扩展名按纯文本渲染（[README](../../packages/client/ui-sidebar-documentpreview/README.zh.md)）。
- **`files`**——`builtin`，以 `openTab('files')` 打开。工作区目录树，经 `list` 懒加载，用 `tab.actions.openResource(fileAddressFor(sessionId, root, path))` 在自己所在 pane 打开文件（[README](../../packages/client/ui-sidebar-files/README.zh.md)）。

## 当前限制

- 官方文档使用浏览器本地 best-effort 持久化，尚无面向用户的 import/export 命令。
- 底部表面复用右侧表面的文案，不提供独立的文案定制。
- 关闭失败会返回调用方；尚未注册统一的面向用户错误呈现。
- 服务上的能力探测数组（`features`）。
- tab 类型的 `option` 优先级档：没有「只列出、不许认领」的 tab 类型。
- 改写记录的标题：`title(address)` 只捕获一次；活的 chip 来自标题 slot，而不是记录。
- 打开时点名某个 tab 实现：`openResource` 最多点名一个 kind；文档渲染器由文件 tab 的工具栏选择。
- 服务上的地址查找（`find`）：调用方用 `revealIfOpened` 打开，由停靠面去重。
- Sidebar 自身 `sidebar://<kind>` 记账之外的导航地址；其语法等导航控制器整体做时再定。
- 面向用户的撤销与内容导航栈（[暂缓](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md#deferred)）。

# Agent Note: 官方 Sidebar 上的 Better 文件宿主

Status: implemented

[English](2026-09-09-official-sidebar-better-file-host.md) | 中文

## Problem

官方 Sidebar 只能把文件资源路由到有界文本预览，而 Better Sidebar 在第二个工作台内持有产品的富编辑器、六种文件 viewer、path 输入框和文件树操作。如果文件打开迁到官方 owner 时没有这些能力，就会失去编辑、媒体与 HTML 预览、二进制处理、文件树变更、打开方式操作，以及布局重挂载期间的编辑器状态。

## Decision

Better Sidebar 注册一个官方内置 tab definition：kind 为 `file`，id 为 `@deepseek-ai/dsh-client-ui-better-sidebar/file`，pattern 为 `dsh-resource://file/**`。Keyed `sidebar.right.pane.tab` 正文依据标签所属 Session 解析每个地址，并且只使用官方 tab info、occurrence signal、导航、payload、替换与分栏 action。它嵌入现有 path 输入框与文件树，保留搜索、显露、重命名、删除、上传、打开方式、对话引用与工作空间围栏行为。`editorExplorer` 偏好选择合并替换或独立文件 occurrence。

本包还通过 `ctx.sidebarRightTabs.registerViewer` 注册与渲染器无关的图片、PDF、Markdown、HTML、代码与二进制下载 definition。组件仍是 keyed `sidebar.right.file.viewer` contribution。媒体 viewer 使用有界 Host 路由，文本 viewer 使用受围栏约束的 `fs.read` 路由；文本读取返回二进制结果时，会先用头字节重新匹配，再进入代码回退。HTML 内容默认通过 Host 路由在 opaque-origin sandbox 中加载。官方偏好持有 viewer 启用状态、HTML 安全、打开方式设置、编辑器布局与工作空间围栏。

`OfficialFileRuntime` 按所属 Session 与 tab id 保留脏内容、编辑模式、HTML occurrence 解锁，以及预览和编辑器滚动位置。React 正文重挂载不会释放这些状态。官方 occurrence signal 在记录消失时释放状态；关闭准入会在丢弃脏草稿前请求确认。文件重命名与删除通过 Session-bound navigator 协调所有受影响的官方 occurrence。

系统 path 拦截、produced-file turn tail 与 Host `sidebar_open` 投递流通过请求所属 Session 的官方 navigator 打开资源。文件夹与 produced-file 显露请求在文件导航参数中携带绝对 path；occurrence 对每个导航 revision 只消费一次，并展开文件树根节点到目标文件之间的所有祖先目录。URL 请求委托给官方 Browser owner。

这实现了[官方 Sidebar 能力融合](../../proposed/architecture/2026-09-09-official-sidebar-capability-fusion.zh.md)中的 Files 与 viewer 部分。其他工作台能力与最终移除快照布局 owner 仍由该提案继续约束。

## Alternatives considered

**继续通过 `ctx.betterSidebar` 导航文件。** 未采用，因为 Member Question、聊天链接与官方 Files 会继续定址第二个工作台，并保留两个文件注册表。

**把 viewer 组件放入官方注册表 definition。** 未采用，因为 definition 必须与渲染器无关并能跨组件 HMR 存续；React 正文及其 store 由 keyed Slot 持有。

**所有文件都使用官方有界文本预览。** 未采用，因为它无法保留 Better 的编辑、媒体、HTML 安全控制、二进制检测或文件树操作。

## Consequences

官方资源打开保留 Better 文件体验，同时由官方工作台持有身份、位置、导航、偏好状态与关闭准入。文件 occurrence 可以重挂载或移动而不丢失脏草稿，二进制数据经过头字节检测后不会进入代码编辑器。

无密钥组装 Member Question 路径覆盖 Markdown 读取、沙箱 HTML 渲染、receiver-owned path、viewer 可用性与折叠/展开行为。Definition 测试覆盖全部六个注册与二进制重匹配；runtime 测试覆盖脏状态保留与关闭准入；open-routing 测试覆盖非活动 Session 定址、文件夹 payload、文件树显露参数、Host 请求校验与 URL 委托。图片、PDF、代码编辑、二进制下载、文件树变更、分栏位置、打开方式、保存快捷键与布局重挂载保留不在该组装场景内。已有 Better 组件测试会运行共享 viewer、编辑器和文件树实现，但不能据此确认这些路径在官方 occurrence 中验收通过。

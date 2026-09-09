# Agent Note: Side Chat 资源与显示归属

Status: implemented

[English](2026-09-10-side-chat-resource-display-ownership.md) | 中文

## 问题

Side Chat 曾在 workbench 内挂载布局层级的 conversation entry，因此嵌入的 child 可能重复渲染主 frame，而非只渲染 Conversation 内容。空白的临时 child 还会进入 Hero phase，挤走 composer。文件操作存在另一项归属冲突：child Session 拥有 path 与文件系统权限，而可见 workbench 属于 parent Session。只用一个 Session 路由，要么会打开不可见的 child workbench，要么会使用错误的工作目录与授权范围。Child 创建还曾把 descriptor 加入 constructor seed，但 seeded Session 要求 seed 与继承前缀完全相同。

## 决策

`main.conversation` 是可复用的 Conversation 内容 entry。`ConversationPresentationOwnerProps` 携带紧凑呈现、下级导航与可选的显示宿主 Session。Shell 会让显示宿主依次通过 `conversation.session`、选中的 View、Chat node 与 Turn tail，但不改变被渲染的 Session binding。空白 Side Chat 保持 active 布局，其 composer 会先占用剩余垂直空间，再固定在底部。

文件路由把被渲染的 child 视为资源 Session，把 parent 视为显示宿主 Session。Chat 文件链接与 produced-file 操作根据 child 工作目录构造 `dsh-resource://file/session/<resource>/...` 地址，再通过 parent 的 `sidebarRight` navigator 打开该地址。官方文件宿主根据地址中编码的资源 Session 执行读取、写入、viewer 加载、文件树操作、引用与对话插入。标签 occurrence 状态、编辑器保留状态，以及重命名或删除后的协调仍归 parent workbench 所有。官方文件 definition 拒绝没有 owner 的绝对地址。

Better Sidebar bundle 导入共享 Client `INLINE_SAFE` 策略。因此，其浏览器安全 Workspace path helper 与官方 Client bundle 使用相同的无运行时身份规则，而不维护另一份 allowlist。

Side Chat 创建只把捕获的 parent 前缀传给 constructor seed，并把 `inheritedEventCount` 设为该前缀的准确长度。Setup 会先把 `subagent/descriptor` 追加为第一条 child-owned 事件，再执行其他 Agent setup，并在首次 prompt 准入之前完成。

## 考虑过的替代方案

**直接挂载 `conversation.session`。** 放弃，因为这样会绕过拥有 phase 选择、composer、header 组合与所选 View 的 Conversation shell。

**把 child 文件地址改写成 parent Session。** 放弃，因为 parent 工作目录与文件系统权限不能标识 child 的资源。Workbench navigator 决定标签显示在哪里；地址决定由哪个 Session 授权并解析资源。

**把 descriptor 放进 constructor seed 并增加继承数量。** 放弃，因为 descriptor 归 child 所有；这样要么违反 seeded-session 前缀不变量，要么会把它错误归类为继承历史。

## 后果

Side Chat 会复用完整 Conversation 内容树而不嵌套应用 chrome，空白草稿的 composer 保持在底部。主 conversation 不提供可选显示宿主值，继续沿用原有路由。Side Chat 文件链接、行导航、produced-file chip、文件夹显露、编辑器写入与“添加到对话”操作都会处理 child 资源，同时把标签显示在 parent 的可见 workbench 中。每个官方文件地址都会明确保留资源 Session，包括其工作目录之外的 path。Child 日志保留精确的继承前缀，随后记录 child-owned descriptor。

## 测试

聚焦 Client 测试覆盖内容 slot 挂载、空白 Side Chat phase、constructor seed 长度、descriptor 追加顺序、child 地址与 parent navigator 路由、行参数、produced-file 与文件夹操作、编辑器读取/写入/插入归属，以及主 conversation 路由保持不变。Better Sidebar bundle 与完整 Client build 会在 Client purity 策略下执行共享 Workspace path helper。

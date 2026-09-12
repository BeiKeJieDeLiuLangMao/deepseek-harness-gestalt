---
description: "Web GUI 的外壳布局：三栏 AppFrame、框架持有的 workbench 宿主、面板几何服务与主题呈现。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的 AppFrame、栏与行的几何布局、Session workbench 使用的稳定 DOM 宿主，以及 `ctx.layout` 呈现控制。框架测量自身区域、保护会话中栏，并且只根据 workbench 当前报告的呈现状态预留轨道。主题展示转换器负责配色、别名 token、正文字号与 document 元数据。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

root slot 组合 `sidebar`、`conversation`、一个 Session 作用域的 `workbench`，以及可追加的 `shell.overlay`。左侧栏宽度为 264–420px，默认 280px，收起后保留 56px 控制栏；窗口低于 1024px 时自动收起。右侧表面首次请求框架宽度的 45%，之后保留用户的像素偏好，上限为 70%。为了给中栏保留 400px，框架先把右侧表面缩到 300px，仍不足时报告空间不足。拖动右侧边缘时通过框架的限制逻辑写入宽度。

框架拥有两个 DOM 宿主。右侧宿主位于右栏并占满框架高度；底部宿主位于中栏第二行，因此它的高度不会缩短右侧表面。两个稳定 id、测得的窗口宽高、实际中栏与右轨道宽度、预计右面板宽度、可用性和宽度回调共同组成 `workbench` owner props。workbench 解析这些 id，并从同一棵 React 与 store 树把两个表面 portal 到宿主中。Desktop 原生 overlay document 不渲染 workbench 与 conversation。

`ctx.layout.openRightbar(track, fullscreen)` 报告右侧表面。宽屏全屏表面可以保留底层轨道；窄屏自动全屏不请求轨道。`openBottombar(height, fullscreen)` 报告底部表面。可见的 push 底部表面在中栏内预留高度；全屏或隐藏时预留高度为零。`closeRightbar()` 与 `closeBottombar()` 释放对应轨道。右侧缩放手柄归框架所有；底部表面拥有高度和共享角落的拖动手势。

本插件在 root slot 组合侧栏、中央内容与右栏。左栏为264～420px，默认280px，收起后保留56px；窗口低于1024px时自动收起，打开右栏也会收起手动展开的左栏。右栏首次打开使用窗口宽度的45%，之后保留用户像素偏好，上限为70%；中栏不足400px时先把右栏压到300px，仍不足则通知占用方收起，最后才继续压缩中栏。拖拽跟手且无过渡延迟，关闭或全屏时不显示右栏拖拽区。

全局面板占据 root 作用域的 `main` keyed slot；`conversation` 是为会话界面保留的 key。`ctx.layout.selectPanel(id)` 选中已注册面板，`null` 则选中会话界面，但不改变当前会话。默认组合不注册任何全局面板。

### 主题呈现

展示转换器消费解析后的主题快照并投影到 document：`html { color-scheme }` 驱动原生 UA 控件，依据当前配色方案设置 `body[data-ds-dark-theme]`，把主题的别名 token 与 `--dsh-content-font-size` 设为 body 上的内联变量，并持有一个 `<meta name="theme-color">`，其内容随计算后的 body 背景色更新。释放展示转换器时，它会连同其他全局写入一起移除自己的元数据节点。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

布局 store 持有最后一次有效的框架宽高、左右宽度偏好，以及两个 workbench 表面的呈现报告。响应式让步不会改写宽度偏好。AppFrame 根据这些事实推导三栏和中栏的两行。它分别传递预计普通右侧宽度与实际预留右轨道；workbench 不请求轨道时，后者为零。底部全屏始终产生零高度行。`ResizeObserver` 通过一个动画帧合并测量。

`workbench` slot 取代原右栏 entry，因为右侧与底部表面共享一个 Session owner。AppFrame 在 `SessionProvider` 下只渲染一次该 slot；没有当前 Session 时，两个宿主均为空。owner props 传递 id、可 JSON 表示的几何值和回调，不传元素或 React producer。全屏呈现会在目标轨道完成设置时禁用框架几何过渡。

`selectPanel(id)` 在改变选中态前检查实时 `main` 注册表；缺失的 key 会抛错并保留当前面板。`beginNavigation()` 为异步 UI 导航返回 abort signal。后续调用、有效面板选择（包括重复选择）或布局释放会中止该 signal，但不取消底层会话创建。消费者在提交导航或搬移草稿前检查 signal。

一次注册声明四个子slot并绑定 `ctx.layout` 的 `selectPanel`、`toggleSidebar`、`openRightbar(track, fullscreen)` 与 `closeRightbar`。同一个 root 存储把 `panelInfo` 选中态与 `layoutInfo` 测量、宽度偏好、呈现报告分开。`usePanelInfo` 订阅引用稳定的选中态对象，AppFrame 订阅引用稳定的布局对象。`rightbar` 的owner参数为实际 `width`、`viewportWidth` 与普通呈现的 `canShow`；占用方在空间不足时执行确定性的收起，变宽不自行重新展开。全屏隐藏宽度手柄，但不自行释放占用方要求保留的轨道。AppFrame 保持各列容器挂载。右栏的 root 控制器仅在选中会话界面时，经 `SessionProvider` 渲染 `rightbar.session`；内容卸载时的报告释放列宽。独立的标题组件仅在会话界面可见时使用所选会话标题，以构建配置的产品标题或本地化 `common.brand.localBuild` 为回退值；语言变化会更新该回退值。主题呈现器是第二个 effect：从解析后的快照做纯 DOM 写入——初始状态经 getter 读取一次，此后仅事件驱动，不经过 React。它先应用调色板、字号与 token 变量，再把渲染出的背景测量为唯一的颜色依据。 全屏呈现禁用网格和手柄过渡；占用方完全覆盖框架后才报告新的列宽。 退出全屏时，框架先保持无过渡并安装目标布局：关闭移除右轨道，恢复保留右轨道。后续普通几何操作恢复正常过渡。

conversation slot 渲染在一个占据完整中栏宽度的真实 flex item 内。框架中不生成盒子的 `display: contents` slot 锚点不会再让 Conversation root 收缩到其受限的内容宽度。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当布局面不够用时阅读以下页面。它们从框架进入它所渲染的栏与它所呈现的主题。

- [ui-sidebar](../ui-sidebar/README.zh.md) 占据 `sidebar` 栏及其 slot。
- [ui-conversation](../ui-conversation/README.zh.md) 占据 conversation 行。
- [ui-sidebar-right](../ui-sidebar-right/README.zh.md) 拥有 Session workbench，并把两个停靠表面 portal 到本框架。
- [ui-theme](../ui-theme/README.zh.md) 拥有本包消费的已解析主题快照。
- [Web 客户端架构](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md) 说明浏览器插件如何注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无。布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **框架几何是瞬时状态。** 重新加载会恢复左侧栏默认值，并清除右侧和底部的呈现报告。Session workbench 拓扑由 `ui-sidebar-right` 持久化。
- **极窄窗口。** 右侧表面释放轨道后，中栏仍可能小于 400px；左侧 56px 控制栏保留。
- **挤压重排期间没有滚动锚定。** 轨道变化可能移动读者的视口。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布配套入口。`ctx.layout` 后的框架 store 不发送 Cordis 事件；包测试直接断言测量、宽度限制、宿主身份、轨道报告与过渡时序。

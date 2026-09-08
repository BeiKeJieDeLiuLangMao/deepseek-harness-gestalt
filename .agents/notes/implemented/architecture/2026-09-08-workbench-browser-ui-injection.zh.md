# Agent Note: 向工作台注入 Browser UI 行为

Status: implemented

[English](2026-09-08-workbench-browser-ui-injection.md) | 中文

## 问题

快照浏览器标签需要 ui-browser 的设置、官方 React chrome 和修订冲突恢复。直接导入功能模块会引入同步 module table 顺序要求，还让工作台独立于浏览器 UI 所有者绑定第二个设置读取器。

## 决定

ui-browser 声明并提供必需的 Cordis `browserUi` face。`createRequest()` 解析 provider 最新的偏好；`renderPageChrome(props)` 返回现有 BrowserPageChrome 元素并保留其 hooks；`recoverListedMutation` 执行现有变更，至多 observe 一次后重试，对已关闭 target 返回 undefined。工作台仅导入 face 声明，等待 provider 后才发布 `workbenchBrowser` 并订阅调和。卸载 provider 会移除该消费者及其订阅；重新加载会再次激活它。

[Client 依赖分类](../process/2026-08-23-client-cross-package-value-dependencies.zh.md) 继续要求呈现贡献通过其声明 slot 注册。此 face 服务于现有的非 slot 快照渲染适配层：BrowserView 委托给 `workbenchBrowser.renderTab`，OfficialBrowserTab 绑定 Session 和标签元数据后请求 provider 的组件。它不引入另一种页面放置方式或通用组件注册表。ui-browser 仍持有预览和设置 slot；工作台按照[官方浏览器决定](../feature/2026-08-21-workbench-official-browser.zh.md)持有页面与标签的调和。

## 考虑过的替代方案

**保留功能模块的 module table 导入。** 其同步顺序违反 Client 依赖分类，也掩盖 provider 生命周期。

**将浏览器行为移至静态工具包。** Profile 偏好与 React chrome 有明确的功能所有者及生命周期；被复用不会让它们成为通用工具。

**用新 slot 系统替换快照渲染器。** 当前 BrowserView 已有唯一的官方渲染适配层。另一个放置机制会扩大产品改动，却不会改善其所有权。

## 影响

创建身份遵循与 Browser 设置相同的实时偏好。真实页面 chrome、refresh、observe、screenshot 和过期关闭恢复保留原实现。工作台要求 ui-browser 可用；只有设置时不能激活。overlay 文档仍只发布渲染器 face，不调和或呈现官方页面。

provider 和消费者测试覆盖加载顺序、卸载及重载、订阅清理、动态身份、真实 chrome 渲染与关闭重试。browser-dock 可运行快照负责组合后的官方窗格；Electron 验收负责 live 页面呈现。

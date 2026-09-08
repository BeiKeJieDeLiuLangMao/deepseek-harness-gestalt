# Agent Note: Initialize the Desktop overlay document before client activation

Status: implemented

[English](2026-09-08-desktop-overlay-document-bootstrap.md) | 中文

## Problem

Desktop Host 在 `?dsh-desktop-overlay=1` 打开原生 chrome，但 Web 入口没有调用文档标记 helper。Desktop 插件因此跳过菜单注册，即使 workbench 消费者能够识别 query。点击 Session Surface 的标签菜单，会打开没有菜单渲染器的 overlay 文档。

## Decision

`AppWebEntry.run()` 在等待 bootstrap 就绪、加载 bundle、激活插件或挂载 UI 之前调用 `markDesktopOverlayDocument()`。`ui-desktop.apply` 向 `shell.overlay` 注册 `DesktopChromeOverlay` 时，文档属性已存在。文档保留此角色，直到导航将其销毁；普通页面不带标记。

Web 入口拥有初始化，因为客户端插件不能依赖另一个插件先发现文档角色。[Official Browser](../feature/2026-08-21-workbench-official-browser.zh.md) 的原生视图设计仍是独立决策。[Settings request projection](2026-09-08-settings-native-request-projection.zh.md)拥有[全屏 Settings 决策](../architecture/2026-08-27-settings-fullscreen-shell.zh.md)要求的订阅与呈现。

## Alternatives considered

**只让 Electron 测试识别 query。** 这能识别视图，却不会安装缺失的菜单渲染器，无法恢复 Side Chat 选择。

**从测试 fixture 或稍后的插件设置属性。** fixture 注入绕过交付的入口，稍后注册则依赖激活顺序。现有 Web 初始化 helper 应先于二者执行。

## Consequences

入口回归通过模块系统与 Cordis Loader 加载真实 Desktop 插件，在挂载前检查菜单席位，并保留普通页面行为。组装后的 Desktop Web 场景经 Host 认证，使用安装依赖闭包加载交付的 Desktop patch，打开 overlay query，并通过 preload IPC fixture 记录真实菜单及其 Side Chat 结果。其 session fixture 拥有 Desktop 持久化投影与 header sidecar；回复复用无需密钥的模型录制分块。移除初始化调用会使组装菜单断言失败。

preload fixture 不能证明 Electron 视图层叠。原生 Electron 验收与 Settings request/result 验证仍是各自独立的义务；bootstrap 回归拥有菜单 golden。

---
description: "Desktop 专属 chrome，以及 Mobile Pairing Settings 中的 Platform Account 状态。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-client-ui-desktop`

[English](README.md) | 中文

## 概述

本包提供仅 Desktop 的 Session Surface chrome 和手机配对、Sub2API 两块 Settings 分区。Desktop Host 的 `--patch` 叠加层插入这一行；浏览器 `dsh web` 不加载。它在 `sidebar.brand` 上选中 GESTALT 字标，填充 `sidebar.chrome.drag`，在 `sidebar.footer.action` 注册 Update Control，并贡献 `手机配对` 与 `账号池` 两个 Settings section。preload bridge 还带 `chromeOverlayShow`，供 Host chrome 请原生 overlay `WebContentsView` 画设置页和侧栏 `+` 菜单。手机配对 section 投影 Host 拥有的当前安装账号与 Personal Pairing 状态，在授权前同时显示中英文隐私说明，并通过 `window.dshDesktop` 发起账号与配对操作；私钥和 pairing key 都不会进入 renderer。Account 状态为 `authorizing` 或 `polling` 时，等待面板通过 `accountCancelLogin` 提供「取消登录 / Cancel sign-in」。配对 panel 拥有 Mobile Access toggle、完整 QR/link invitation、authentication-word confirmation、拒绝与 paired-device list。`账号池` section 是 Host 推送的 Sub2API 组件快照（`missing → downloading → verifying → installed → starting → running / error`）的纯渲染投影：未启用时说明 offer 与数据目录、卸载语义；运行中默认展示 Sub2API 原生账号工作区，并把运行状态、停用与两步式卸载放在右上标题区；错误态展示可操作信息并附重试。账号工作区复用 Sub2API 的账号、IP 管理与 Composite 路由组件和接口，跟随 Desktop 的明暗主题及中英文语言，并且绝不导航 Session Surface。普通 sidebar 不新增账号、配对或 Sub2API 入口。发现可用版本后，Update Control 会在 available、downloading、preparing、downloaded、installing 阶段及后续 error 阶段挂载；disabled、idle、checking 和发现版本前的 error 不占侧栏 seat。非活跃阶段只通过隐藏的 `data-desktop-updater-state` marker 暴露 phase，该 marker 没有文本或无障碍角色；可见阶段在按钮上暴露 `data-desktop-update-control`。更新、窗口与 Sub2API 特权操作仍都走 preload bridge；账号工作区 iframe 使用当前 Host 的同源代理。

macOS chrome 在未改动的 DSH 侧栏标题行和中间 Session 内容上方为原生 traffic lights 保留 28px 空间。Windows 拖拽行横跨视口，三个 caption 按钮位于不可拖拽区域，但不改变 Session 内容的顶部间距。其他开发平台不绘制自定义 Window Chrome，并保留系统窗口框架。

`@deepseek-ai/dsh-client-ui-desktop/pairing-source` ESM 入口仅导出 `createDesktopPairingSource` 和 `bindDesktopPairing`，不加载 UI 插件。调用方拥有可变快照 source 和绑定 disposer；释放绑定会阻止迟到的读取结果与推送，并取消 Host 订阅。配对权限仍由 Host 持有。

## 目录

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

通过 Account、Personal Pairing 和 Remote Access 控件间接影响模型；这些控件会把 Mobile 来源的工作准入 Host Session。

#### KV Cache effect

该 chrome 不增加稳定请求前缀；配对 Mobile 工作经它控制的接收 Host 服务进入模型上下文。

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **没有 `window.dshDesktop` 时插件空转** — 手机配对账号状态、Update Control 与 Window Chrome 不渲染，各自 source 保持初始状态。
- **测试从 `@deepseek-ai/dsh-client-ui-renderer/client` 值导入 `SlotRegistry`** — 生产 `apply` 用 Cordis `Context` 标注根上下文，不导入 renderer。
- **组装后的 Desktop Web E2E 安装 `installDesktopBridgeFixture`** — 该 fixture 缺少必需 preload 成员时类型检查失败，而不是浏览器超时（[带类型的 DesktopBridge fixture](../../../.agents/notes/implemented/testing/2026-08-21-typed-desktop-bridge-e2e-fixture.zh.md)）。
- **产品配对由端点持有** — Host 挂载不透明 mailbox、端点 Snow owner、持久 key vault、密封 Mobile authority 投递和真实 Relay 生命周期。独立评审与 WebView 真机运行仍是发布证据。

本包不发布运行时不变式配套插件，因为 Host 不贡献状态，Client bridge subscription 与 slots 仍由其来源服务拥有。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>

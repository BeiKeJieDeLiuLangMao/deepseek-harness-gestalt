# Agent Note: 通过 Settings owner 投影原生 Settings request

Status: implemented

[English](2026-09-08-settings-native-request-projection.md) | 中文

## Problem

Settings 触发器在普通 Desktop document 中打开组件本地 modal，而原生 overlay document 没有 Settings request consumer。真实 Electron 的 provider 配置路径切换到该 overlay 后找不到 Models。Document bootstrap 能恢复原生菜单，却不能单独恢复 Settings。

## Decision

Settings owner 实现[全屏 Settings 决策](../architecture/2026-08-27-settings-fullscreen-shell.zh.md)规定的三种呈现模式。浏览器 Web 在本地打开页面；普通 Desktop 发送 Host request；overlay 使用同一个 SettingsPage、section slot 和全视口 CSS 渲染该 request。Close 和 Escape 返回当前 request id。不引入第二个 Settings renderer 或 Host protocol。

私有 adapter 在 `apply` 中捕获 preload 边界，通过注入的 observable 投影当前 request，并提供普通的原生操作 callback。组件不读取环境 bridge，也不持有 IPC subscription。Adapter 先订阅再做初始读取；更新的 event 到达后会拒绝该读取的陈旧结果。匹配 reply 只关闭自身 request，重复 close 只发送一次；dispose 释放 subscription 并排空已接受调用，不在结束后发布状态。Show 被拒绝时，只清除仍为当前的 request 并报告错误。

Adapter 以结构化窄接口消费既有 preload 字段。Ui-desktop 已经依赖 Settings owner，反向新增 ui-desktop 依赖会形成 project-reference 环。完整 wire definition 仍归 ui-desktop，装配 fixture 在普通页面与 overlay 页面之间转发同样的 request/result operation。

## Alternatives considered

**在 Electron 验收中打开普通 modal。** 原生 official-page view 位于该 document 之上；这种做法绕过已接受的 Settings 路径，不能证明其呈现。

**在 SettingsRoot 内恢复 bridge 读取和 subscription。** 外部状态属于注入的 observable 通道。组件本地 subscription 会重复框架生命周期，并允许迟到的初始读取覆盖更新的 Host request。

**创建公开 Settings chrome service 或 slot。** 既有 Settings owner、preload 边界和 sidebar.settings occupant 已经提供完整路径；另一个 registry 会增加独立生命周期状态。

## Consequences

Document [bootstrap](2026-09-08-desktop-overlay-document-bootstrap.zh.md)仍是原生模式选择的前提。Settings 保留当前连接恢复、onboarding registrant、section 导航和焦点恢复。只有浏览器本地 Settings 持有 overlay-lock 握手；原生 view stacking 归 Host。

测试覆盖 request 关联、初始读取竞争、待完成调用期间的卸载、operation 失败、按模式渲染和 section 打开。真实 Desktop-patch Web 场景操作普通 Settings 触发器，把 preload operation 转发到独立启动的 overlay document，点击 Models、验证全视口覆盖，并返回 header/Escape close result。Web 场景验证相同的全屏几何。原生 Electron 验收仍用于证明 view stacking 与完整 create/restore/archive 路径。

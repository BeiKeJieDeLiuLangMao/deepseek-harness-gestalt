---
description: "面向 Host 浏览器消费方的同源手机 IO、屏幕采集代理与托管 Android/iOS agent 恢复。"
kind: "package-reference"
---

# @deepseek-ai/dsh-phone-stream

[English](README.md) | 中文

## 概述

通过 Host 同源路由向浏览器提供手机 IO、屏幕采集与托管 agent 恢复，无需直接暴露 mobilecli。该插件发布设备清单、签名 MJPEG/H264 URL 和经过信任检查的 WebSocket 操作通道，并保留结构化设备错误。ui-phone 负责实测画面布局；签名采集 URL 仍仅限回环地址。

## 目录

- [包约定](#package-contract)
- [配置](#config)
- [扩展点](#extension-points)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包约定

手机 IO、屏幕采集与 Android/iOS 托管 agent 恢复的同源 Host Consumer。插件注入 `phoneDevices` 与 `webServer`，注册设备清单和 agent 路由、一条 WebSocket 升级路由和签名 HTTP 采集路由，并发布 `ctx.phoneStream`。浏览器永不直连 mobilecli `:12000`：tap/swipe/text/button JSON-RPC 走 `/phone/ws/io`，MJPEG/H264 帧走由 `sessionFor` 签发的 Host 同源 URL。本包签发唯一采集身份并转发帧；ui-phone 负责按实测画面尺寸排版。

- `sessionFor(id, agentManaged, preferredFormat)` — IO 升级路径、设备类别的首选编码，以及签名的 `mjpeg` 与 `h264` URL，查询 token 在 `tokenTtlMs` 后过期；`agentManaged` 标记画面或 socket 失败可进入 agent 恢复的 Android 与 iOS 会话。tap / swipe 的 JSON-RPC 错误保持画面会话。
- `POST /phone/session` — 为最新清单中存在的设备签发这些 URL；先执行 `/api` 信任栅栏。Android 设备与 iOS 真机首选 H264；iOS 模拟器因 mobilecli 会拒绝其 AVC 采集请求而首选 MJPEG。对于选中的确切 iOS 真机或模拟器，mint 先运行 `agentStatus`；agent 缺失时执行不带 `force` 的幂等 `installAgent`，复检同一设备，然后才签发。三次调用均携带请求的取消 signal。模拟器安装不传 provisioning profile；真机安装使用 `phone-runtime` 解析的 profile。仅当安装后选中设备的 agent 仍缺失时才返回 `PHONE_AGENT_MISSING`。抛出的安装失败保留既有错误码：`PHONE_AGENT_PROFILE_REQUIRED`、`PHONE_REAL_DEVICE_ISSUE` 分支（`device-locked`、`cert-untrusted`、`profile-expired`），以及经 `PHONE_UPSTREAM` 透出的 `INSTALL_FAILED_USER_RESTRICTED`。Host 未配置 `provisioningProfilePath` 时不会跳过真机安装。Android 跳过 mint 时检查。所有成功的 session 都携带 `agentManaged: true`，使后续画面或 socket 失败能够复检 agent；tap / swipe 的 JSON-RPC 错误不会。
- `POST /phone/agent/status` 与 `POST /phone/agent/install` — 为清单中的 Android 与 iOS 真机检测、安装或强制重装设备控制代理，并拒绝 iOS 模拟器。Android 安装在产品内保持一键完成；OEM 系统确认或开发者安全开关仍必须在手机上同意。签名 identity、provisioning profile 选择、Developer Mode、设备解锁与信任仍由用户处理。未配置 `provisioningProfilePath` 时返回带配置动作的 `PHONE_AGENT_PROFILE_REQUIRED`，不退化成通用上游失败。
- `GET /phone/devices` — 依据最近一次 `phoneDevices.listDevices()` 应答分组后的设备清单（`android`、`ios.simulators`、`ios.reals`；每项含 `id`/`name`/`kind`/`state`/`online`，`state` 原样保留上游状态，以及 Host `dumpsys display` `logicalFrame` 上的可选 Android `logicalDisplay`）；先执行 `/api` 信任栅栏，仅限精确路径的 GET。`PHONE_DEVICE_NOT_FOUND` 以外的 `PhoneDevicesError` 以 502 返回 `{ error: { code, message, issue? } }`，保留每个 `PHONE_REAL_DEVICE_ISSUE` 分支，并把 `PHONE_UNRESOLVED` 安装指引带到浏览器。
- `GET /phone/stream/<id>/<mjpeg|h264>?token=` — 反代 `device.screencapture`。先执行 `/api` 信任栅栏，再执行 loopback Host 栅栏，最后校验 HMAC；过期、伪造或非 loopback 请求返回 403。代理接受上游 `device.screencapture` 的两种应答形态——裸字节流，以及 mobilecli 1.0.5 的 `{ format, sessionUrl }` 信封（会话 URL 必须留在回环栅栏内）——并把 multipart MJPEG 体在单一归一化边界下重新发出：丢弃非图像段（JSON 通知），帧字节原样保留。
- `GET /phone/ws/io` 升级 — 在 `/api` 信任栅栏之后转发 `device.io.tap` / `swipe` / `text` / `button` JSON-RPC；tap 与 swipe 可携带 live 采集尺寸及精确 H264 旋转；任意 gesture 帧会被拒绝。未信任的升级在协议协商前被拒绝。

<a id="config"></a>
## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `tokenTtlMs` | `30000` | 已签发采集 URL 的有效期；若绝对到期时间超出 JavaScript 安全整数范围，签发会失败。路径前缀、HMAC-SHA256 与 loopback 采集栅栏不可配置。 |
| `transportCleanupTimeoutMs` | `1000` | 已接纳 HTTP 事务、WebSocket 连接/服务器关闭及分离传输清理的有界关闭时间。接纳与模块持有的权威会同步终止；外部 Promise 可由终结观察器稍后收敛。 |

<a id="extension-points"></a>
## 扩展点

组合必须提供 `phoneDevices` 与 `webServer`；fiber 会等待二者。`./invariant` 伴生体为空，因为 Host WebServer 的 effect 持有路由注册与注销。

<a id="model-experience"></a>
## 模型体验

无模型体验：本包是纯 Host 侧反代，不注册任何提示词、工具 schema 或其他模型可见面。

#### KV 缓存影响

与模型请求无关：插件只注册 Host HTTP 与 WebSocket 路由，从不写入会话事件，因此前缀复用与缓存行为不受影响。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **采集 URL 仅限 loopback** — 即使是受信任的 LAN Host 也会被拒绝，因此非 loopback 部署在后续票补上已鉴权远程路径之前无法播放设备视频。
- **无 GUI** — 本包不渲染 `react-device-view`，也不强制 1:2 画面比例；ui-phone 稍后消费已签发 URL。
- **mobilecli 仍需用户安装** — `phone-runtime` 仍持有二进制发现与启动；没有该 Service 时本 Consumer 无法组合。

<a id="dev-note"></a>
### 开发备注

无。

---
description: "Personal Pairing HTTP 与 Remote Relay WSS Consumer。"
kind: "package-reference"
---

# 远程访问 HTTP

[English](README.md) | 中文

## 概述

公开远程访问服务的 HTTP 与 WSS 消费方。一个固定 HTTP 路由接收当前安装的账号证明请求头、校验操作输入，并且只通过 `ctx.remoteAccess` 委派。配对挑战请求把 TCP 对端地址交给每 IP 小时配额。`QUOTA` 与 `PLATFORM_CAPACITY` 映射为 HTTP 429，JSON 含 `retryAfter`，并带 `Retry-After` 响应头。附件准入操作（`admit-blob`、`release-blob`）按声明大小执行对应配额。精确 WSS 路径只接收 Relay Transport frame，并通过 `ctx.remoteRelay` 委派已鉴权 attachment。JSON 请求体与错误信封走 `@deepseek-ai/dsh-host-webserver` 助手，错误码与文案仍由 Remote Access 持有。

HTTP 消费方要求非空且精确的 `origins` 配置。匹配的标准和自定义元组 origin 会在 `Access-Control-Allow-Origin` 中收到已配置值；带路径的 origin、畸形值、未配置 origin 与 opaque `null` 会收到 `ORIGIN_DENIED`。

消费方不读取账号数据库字段，也不自行授予权限。远程访问提供方会在任何配对生命周期变更前，通过平台账号公开服务鉴别账号、安装标识及安装类型。

WSS 消费方要求端点自有的 challenge request 与签名 attach proof 先于任何 Relay 密文，执行显式 pending-challenge／attach deadline 与协议消息字节上限，关闭压缩，串行处理 frame，并且只在鉴权与目录注册完成后发送 ready。它随 socket 一起清理 Relay attachment，并且只返回不含内容的稳定 transport error。组装测试启动两套由独立 Loader 持有的 WebServer／HTTP composition，经 non-sticky TLS endpoint 到达两者发布的 WSS upgrade handler，并以独立撤销运行两项端点自有 Snow 配对。其中的 localhost 证书与内存适配器是确定性测试输入；TLS 终止与已运营基础设施仍由部署负责。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

无，因为 HTTP 与 WSS Consumer 只携带配对 authority、路由和密文，不创建发往模型的内容。

#### KV Cache 影响

HTTP 与 WSS 层不增加模型请求内容，因此不影响提供方缓存复用。

## 已知限制与暂缓事项
<a id="known-limitations-and-deferred-work"></a>

- WSS 消费方只转发不透明 Relay 密文；它从不接受 Host request 或 Companion 明文。
- 部署 TLS、边缘限制与审计策略仍由 Platform 组合负责。

本包不发布运行时不变式配套插件，因为 WebServer effect 与私有 pump set 由所属路由及 Consumer 生命周期结算，没有独立发布的事件流。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>

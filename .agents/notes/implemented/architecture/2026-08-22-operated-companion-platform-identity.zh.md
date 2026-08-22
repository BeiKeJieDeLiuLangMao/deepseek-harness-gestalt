# Agent Note: 将 Companion 产品绑定到唯一实际运行的 Platform 身份

Status: implemented

[English](2026-08-22-operated-companion-platform-identity.md) | 中文

## 问题

Desktop 与 Mobile 产品入口可以选择开发身份对和 keyless Remote Access 路径，而 Platform 监听入口会补入第二套虚拟身份，并允许存储默认值或关闭证书校验。因此，本地 Account provider 或内存 authority 可能看起来像产品，却没有使用实际运行的身份与共享持久存储。

## 决策

Desktop、Mobile 与 Platform 监听入口只接受一套完整生产身份。`loadOperatedPlatformEnvironment` 会在产品入口读取状态、渲染、打开窗口、连接存储或发送流量前，拒绝缺失字段、非 HTTPS 或回调不匹配的值以及 localhost。Desktop 与 Mobile 不暴露开发或 keyless selector。确定性 keyless 代码位于命名明确的测试 fixture 下，产品 import graph 无法触达。

GitHub Environment `production` 提供 GitHub OAuth client id、固定回调、credential reference 与解析后的 secret、PostgreSQL database identity、identity namespace、Redis ACL identity 和 Relay Redis key prefix。监听入口没有虚拟身份对或身份 fallback。PostgreSQL 与 Redis 必须校验证书。`OperatedRemoteAccessResources` 同时拥有 PostgreSQL Personal Pairing authority、Relay route store 与 Redis Relay coordinator；迁移在监听前完成。在经过评审的 Companion channel provider 接入前，配对 HTTP 与 Relay WSS 保持 fail-closed。

`verify-companion-product-entry` gate 会跟随三个产品入口的相对 import，并拒绝固定 GitHub fixture 身份、keyless provider、内存 authority、通用环境选择、proof-only example、开发 trust origin 与关闭证书校验。持久资源 assembled 测试会启动临时 PostgreSQL 与 Redis fixture 并执行产品资源模块，但它不证明 #43 的实际运行部署已经在线。

## 曾考虑的替代方案

**在产品客户端保留经过校验的开发／生产身份对。** 否决，因为一套未使用的身份仍保留任意 endpoint 选择，并使本地 proof 配置看起来像受支持的产品环境。

**把 keyless provider 留在产品源码中并用环境检查保护。** 否决，因为运行时检查仍让 proof 实现处在发布入口的可达图中，也会把一次打包错误变成安全决策。

**允许 Platform 存储使用本地 TLS 例外。** 否决，因为能关闭证书校验的部署设置会改变产品 trust model。测试 fixture 会注入自己的非 TLS client，而不会进入产品配置。

## 后果

产品配置不完整或指向本地时，启动会直接停止，而不是在其他产品工作开始后才投影 unavailable Account。发布与部署 workflow 必须显式提供每项公开身份和 credential reference。本地测试仍保留确定性 fake，但其名称与位置使它们不能被引用为产品行为。仓库证明的是持久 adapter 装配；#43 仍拥有实际运行基础设施证据，经过评审的加密 channel 也仍是独立依赖。

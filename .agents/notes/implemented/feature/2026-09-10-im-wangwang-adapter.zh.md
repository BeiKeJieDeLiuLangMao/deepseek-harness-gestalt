# 用于账号接管的旺旺/千牛 IM 适配器

[English](2026-09-10-im-wangwang-adapter.md) | 中文

- 领域: `area/session`
- 类型: `kind/feature`
- 关联 Issue: #618 (隶属于 #613)
- 前序依赖: T1 IM 领域配置与路由 (#615) & T2 IM 消息投递与历史 (#616)

## 问题

DeepSeek Harness 工作区智能体接管旺旺/千牛账号需要一个专用的适配器对接旺旺 OpenAPI，同时解耦业务逻辑并保护凭据安全：
1. 平台缺乏 `whoami` 接口，禁止运行时猜测或 UI 手动输入商户 ID。
2. AccessKey 与 SecretKey 必须严格通过 `CredentialRef` 接入 `CredentialProvider` 凭据隔离层，避免明文密钥泄漏至配置、日志或诊断输出中。
3. 历史消息轮询必须整页处理成功后才推进游标，并能安全拒绝游标倒退或乱序到达。
4. 出站发送必须清晰区分前置校验失败（账号暂停、路由未配置或禁用）与不明确响应（网络超时或 5xx 造成的 `result_unknown`），且严禁对未知结果盲目重试。
5. 入站发送者类型需严格划分为 `external`、`human_native`、`human_dsh`（匹配本地出站回显）、`ai_outbound`（带上游事实证据）及 `unknown`，不信任无结构的客户端自证。

## 方案

实现独立包 `@deepseek-ai/dsh-im-wangwang` (`packages/im/im-wangwang`)：
- **准入商户目录**：配置显式的 `admittedMerchants` 列表，将 `merchantId` 映射至 Harness `accountId` 及 `CredentialRef`。拒绝任何动态探测或盲目猜测。
- **隔离层凭据解析**：在发起调用时通过 `ctx.credentials.resolve(ref)` 实时解析 AccessKey 和 SecretKey，不驻留明文。
- **原生 HMAC-SHA256 签名**：基于 Node.js 原生 `node:crypto`，针对 HTTP 方法、路径、规范排序查询参数和毫秒时间戳生成确定性签名。
- **整页处理与游标防卫**：拉取的事件页全量持久化至 `ImDeliveryService` 之后才更新本地游标；遇到倒退时抛出 `CHANNEL_CURSOR_REGRESSION`。
- **发送者事实推断**：依据协议结构化字段（senderType 1/2/3、producerId 及本地出站记录匹配）确定分类，不信任客户端伪造。
- **出站状态结算**：明确界定前置阻断（`pre_send_failed`）、成功回执（`sent`）与歧义结果（`result_unknown`）。

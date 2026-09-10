---
description: "用于 DeepSeek Harness IM 账号接管的旺旺/千牛 IM 适配器"
kind: "package"
---

# @deepseek-ai/dsh-im-wangwang

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-im-wangwang` 包实现了 DeepSeek Harness 的旺旺/千牛 IM 适配器。它提供准入商家目录管理、通过 CredentialProvider 隔离层按请求解析凭据、原生 HMAC-SHA256 请求签名、基于持久通道游标且带整页持久化保证的增量事件拉取、经本地出站证据核验的发送者身份判定，以及可靠的出站投递追踪。

## 特性

- **准入商家目录**：预配置的准入商家目录。严禁运行时猜测、假发现或通过 UI 手动输入未授权的 merchantId。
- **凭据隔离层**：AccessKey 与 SecretKey 通过 `CredentialRef` 引用，并在每次请求时经 `ctx.credentials` 动态解析。凭据从不作为实例状态保存，也不出现在配置或日志中。
- **原生 HMAC-SHA256 签名**：使用 Node.js 原生 `node:crypto` 产生确定性签名头（`x-api-access-key`、`x-api-timestamp`、`x-api-signature`）。
- **持久游标与整页不变性**：通道游标保存在适配器自有的 `im_wangwang` 存储域中，可在宿主重启与崩溃后恢复。同一商家的并发拉取被串行化，游标读取 → 拉取 → 推进的周期绝不交错；入站页面在投递域中完整持久化后才推进游标，任何倒退均以 `CHANNEL_CURSOR_REGRESSION` 安全拒绝。
- **出站证据核验的发送者分类**：每笔成功投递的 DSH 出站消息都会写入持久回显记录（`sent_echoes`）；入站 senderType 声明只有与本地证据一致时才被采信：
  - `1`：外部客户（`external`）
  - `2`：千牛原生人工（`human_native`）；当 messageId 匹配到已投递的 `human_manual` 回显时为 `human_dsh`
  - `3`：仅当 messageId 匹配到已投递的 DSH AI 回显时才为 `ai_outbound`；未核验的 AI 声明降级为 `unknown`
  - 不明或矛盾声明归为 `unknown`，不信任客户端自证
- **出站歧义防卫**：严格区分发送前失败（路由禁用、账号暂停，由 `ImDeliveryService.registerOutbound` 负责判定）与歧义响应（网络失败、408、429 或 5xx 时经结构化 `WangwangAmbiguousError` 归为 `result_unknown`），绝不盲目重试。

## 使用方式

在 `cordis.yml` 中注册：

```yaml
- name: '@deepseek-ai/dsh-im-wangwang'
  config:
    endpoint: 'https://openapi.fliggy.com'
    admittedMerchants:
      - merchantId: 'merchant_001'
        accountId: 'acc_ww_001'
        displayName: 'Official Store'
        accessKeyRef: 'WANGWANG_ACCESS_KEY'
        secretKeyRef: 'WANGWANG_SECRET_KEY'
```

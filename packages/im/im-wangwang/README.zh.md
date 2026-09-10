---
description: "用于 DeepSeek Harness IM 账号接管的旺旺/千牛 IM 适配器"
kind: "package"
---

# @deepseek-ai/dsh-im-wangwang

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-im-wangwang` 包实现了 DeepSeek Harness 的旺旺/千牛 IM 适配器。它提供准入商家目录管理、通过 CredentialProvider 隔离层的凭据引用解析、原生 HMAC-SHA256 请求签名、带整页持久化保证的增量事件拉取、进度游标倒退防卫以及可靠的出站投递追踪。

## 特性

- **准入商家目录**：预配置的准入商家目录。严禁运行时猜测、假发现或通过 UI 手动输入未授权的 merchantId。
- **凭据隔离层**：AccessKey 与 SecretKey 通过 `CredentialRef` 接入 `ctx.credentials`，配置与日志中永不出现明文密钥。
- **原生 HMAC-SHA256 签名**：使用 Node.js 原生 `node:crypto` 产生确定性签名头（`x-api-access-key`、`x-api-timestamp`、`x-api-signature`）。
- **整页处理与游标不变性**：历史消息拉取时必须整页持久化成功后才推进游标；任何游标倒退均以 `CHANNEL_CURSOR_REGRESSION` 安全拒绝。
- **入站发送者分类**：
  - `1`：外部客户（`external`）
  - `2`：千牛原生人工（`human_native`），若匹配 DSH 出站回显则为 `human_dsh`
  - `3`：上游 AI（`ai_outbound`）携带 producer 事实证据
  - 不明或矛盾声明归为 `unknown`，不信任客户端自证
- **出站歧义防卫**：严格区分发送前失败（路由禁用、账号暂停）与外部歧义状态（`result_unknown`），网络超时或服务端异常绝不盲目重试。

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

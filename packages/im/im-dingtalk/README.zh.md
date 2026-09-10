---
description: "钉钉 DWS 适配器，支持 DeepSeek Harness IM 账号接管能力。"
kind: "package"
---

# @deepseek-ai/dsh-im-dingtalk

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-im-dingtalk` 包基于已安装的钉钉工作台 CLI（`dws`）提供钉钉账号接管适配器。它通过标准 DWS 子进程命令（`dws event consume`、`dws chat message send`、`dws chat message reply`、`dws chat message query-send-status`）将授权的个人账号身份连接至 DeepSeek Harness 工作区。

## 服务标识

在 Cordis 中注册为 `ctx.imDingtalk`：
- **服务定义**：位于 `./spec.ts` 的 `DingTalkDwsAdapterService`
- **服务实现**：位于 `./service.ts` 的 `DingTalkDwsAdapterServiceImpl`

## 核心契约

- **子进程生命周期**：通过 `ctx.subprocess` 管理短生命周期事件流进程。上下文释放（dispose）时优雅终止所有子进程。
- **发送者证据判定**：严格分类入站消息为 `external`、`ai_outbound`、`human_native`、`human_dsh` 或 `unknown`，杜绝臆测。
- **出站防盲重试**：发送前验证 AI 消息的账号暂停状态。未决或超时结果标记为 `result_unknown`，禁止无确认重发。
- **引用回复规范**：引用回复严格使用 `--conversation-id`、`--ref-msg-id` 与 `--ref-sender`，绝不传入 `--group`。
- **默认空闲挂载**：`@deepseek-ai/dsh-base` 挂载本适配器时不调用 `startConsumer`，因此空 profile 不会拉起 DWS。

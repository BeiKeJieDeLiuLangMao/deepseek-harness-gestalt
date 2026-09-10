# Agent Note: IM takeover assembled acceptance

Status: implemented

[English](2026-09-10-im-assembled-acceptance.md) | 中文

## Problem

T1–T7 各自证明一条接缝。装配验收仍须把已配置账号、路由、夹具适配器、模拟用户、被测 Agent、停止隔离和 Sidebar 呈现放在同一条路径上，且不得把 mock 或 dry-run 当作真实端到端证据。

## Decision

`packages/im/im-core/tests/assembled-acceptance.spec.tsx` 用真实 Cordis Loader 的 `cordis.yml` 装配 im-core 投递、协调、模拟和 `@deepseek-ai/dsh-im-dingtalk`，钉钉 DWS 走 stub subprocess。被测工作区上的生产 Agent 接收 mention 触发的 steer。同一条历史经 `conversationMessagesFromRecords` 写入 `ConversationTab`。模拟出站不捕获 DWS argv；夹具真实群发送带 `--group`。`result_unknown` 不是成功。`IM_LIVE_LANE_BEHAVIORS` 点名真实钉钉登录、真实旺旺读取、真实出站、真实模型调用和原生 Desktop GUI computer-use。

## Alternatives considered

**用真实模型录制 headless ACP snapshot。** 否决，因为真实模型调用需要另行授权；无密钥域组合已能证明路由、触发、分类、路径对等和停止。

**把原生 Desktop GUI computer-use 当作本票据证据。** 否决，因为该车道仍未配置；报告点名它，而不是用 mock 截图顶替。

## Consequences

装配验收是无密钥的。真实读账号、真实出站、真实模型调用和原生 Desktop GUI computer-use 仍需另行授权。审批仍只走原生审批界面。

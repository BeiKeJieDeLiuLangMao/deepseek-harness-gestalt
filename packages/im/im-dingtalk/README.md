---
description: "DingTalk DWS adapter for DeepSeek Harness IM account takeover."
kind: "package"
---

# @deepseek-ai/dsh-im-dingtalk

English | [中文](README.zh.md)

## Summary

The `@deepseek-ai/dsh-im-dingtalk` package provides the DingTalk account takeover adapter using the installed DingTalk Workspace CLI (`dws`). It connects authorized user identities to DeepSeek Harness workspaces via standard DWS subprocess commands (`dws event consume`, `dws chat message send`, `dws chat message reply`, `dws chat message query-send-status`).

## Service key

Registers as `ctx.imDingtalk` under Cordis:
- **Service Definition**: `DingTalkDwsAdapterService` in `./spec.ts`
- **Service Implementation**: `DingTalkDwsAdapterServiceImpl` in `./service.ts`

## Key contracts

- **Subprocess lifecycle**: Manages ephemeral child process event streaming via `ctx.subprocess`. All child processes terminate gracefully on context disposal.
- **Evidence classification**: Strictly classifies inbound messages into `external`, `ai_outbound`, `human_native`, `human_dsh`, or `unknown` without guessing.
- **Outbound safety**: Pre-send checks account pause states for AI messages. Unknown outbound delivery receipts (`timeout`, `signalled`) settle as `result_unknown` to prevent duplicate sends.
- **Reply command compliance**: Quotation replies strictly require `--conversation-id`, `--ref-msg-id`, and `--ref-sender`, and never pass `--group`.
- **Idle default mount**: `@deepseek-ai/dsh-base` mounts this adapter without calling `startConsumer`, so an empty profile does not spawn DWS.

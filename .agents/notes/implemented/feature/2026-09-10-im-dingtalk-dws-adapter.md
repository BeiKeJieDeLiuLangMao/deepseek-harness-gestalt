# DingTalk DWS adapter for IM account takeover

English | [中文](2026-09-10-im-dingtalk-dws-adapter.zh.md)

- Area: `area/session`
- Kind: `kind/feature`
- Issue: #617 (part of #613)
- Parent: T1 IM domain configuration (#615), T2 reliable delivery (#616)

## Problem

Live IM account takeover on DingTalk requires integrating with the installed DingTalk Workspace CLI (`dws`) to act as the authorized user account rather than a bot.
1. The adapter must run the event stream consumer (`dws event consume --format ndjson --ephemeral`) in a managed subprocess.
2. Inbound NDJSON events must be parsed and strictly classified into `external`, `ai_outbound`, `human_native`, `human_dsh`, or `unknown` without guessing.
3. Message sending (`dws chat message send` or `reply`) must enforce platform parameter constraints: quotation replies strictly require `--conversation-id`, `--ref-msg-id`, and `--ref-sender` and never pass `--group`.
4. Ambiguous delivery outcomes (timeouts, process termination before exit code settlement) must settle as `result_unknown` rather than blindly retried, preventing accidental double-sends.
5. All child processes must terminate cleanly upon Cordis context disposal without leaking orphan CLI processes.

## Solution

Implemented `@deepseek-ai/dsh-im-dingtalk` providing `DingTalkDwsAdapterService` registered under `ctx.imDingtalk`:
- **Subprocess Integration**: Spawns `dws event consume` with `ctx.subprocess.spawn`, captures stdout NDJSON line by line, and forwards records to `ctx.imDelivery.receiveInbound`.
- **Sender Evidence & Classification**: `classifySender` strictly inspects self-identity metadata, AI tag flags, and client source attributes, maintaining evidence facts.
- **Strict Outbound Flags**: `sendMessage` distinguishes direct chat targets (`--user`, `--open-dingtalk-id`) and group targets (`--group`). When replying to an existing message, it uses `dws chat message reply` with required references and omits `--group`.
- **Result-Unknown Guard**: Timeouts and non-clean exits return `result_unknown` or `pre_send_failed` without auto-retry.
- **Status Inquiry**: `querySendStatus` queries `dws chat message query-send-status --open-task-id` and normalizes responses into `sent`, `failed`, `pending`, or `unknown`.
- **Clean Disposal**: Registers effect disposer `imDingtalk.disposeAll` terminating all running consumer child handles on Context disposal.

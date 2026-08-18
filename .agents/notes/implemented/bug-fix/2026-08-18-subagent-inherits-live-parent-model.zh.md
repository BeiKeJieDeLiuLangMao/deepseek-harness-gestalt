# Agent Note: 子代理继承父会话当前模型

Status: implemented

[English](2026-08-18-subagent-inherits-live-parent-model.md) | 中文

## Problem

Web 会话切换模型会更新下一次父会话提示词使用的实时 `ModelSelection`，之后的父会话轮次也会把该路由记入 `request/header`。启动子代理时却仍复制 `parent.options.provider` / `parent.options.model`，这两个字段停在 Agent 创建时。从 GLM 切到 Grok 后，父会话走 Grok，新 child 仍按 GLM 启动并失败。

## Decision

`inheritParentAgentRoute` 是进程内 one-shot 与 continuable child（含 continuable descriptor）共用的父路由快照。它优先读 `liveModelSelection(parent)`（与下一次父会话提示词相同的已安装选择），否则读最新已记录的 `request/header`，再否则读创建时的 `AgentOptions`。显式 `request.agentOptions` 覆盖仍然生效。

## Alternatives considered

**只读最新 `request/header`。** 会漏掉尚未产生父会话轮次的切换，而这正是「我改了模型，然后启动子代理」的常见路径。

**在 `session.selectModel` 时改写 `Agent.options`。** 会让创建时选项变成所有其它消费者眼中的移动目标。

## Consequences

父会话切换模型后再启动的 child 使用父会话当前指向的路由。测试覆盖实时选择、已记录 header 回退、创建时回退，以及显式 child 覆盖。

## Testing

`packages/core/agent/tests/model-selection.spec.ts` 固定 `liveModelSelection` 在 dispose 前指向已安装 ref。`packages/subagent/subagent/tests/child-agent.spec.ts` 固定三层继承与显式覆盖。

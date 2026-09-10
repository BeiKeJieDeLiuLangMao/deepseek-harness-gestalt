# Agent Note: IM Host composition on dsh-base

Status: implemented

[English](2026-09-10-im-host-base-composition.md) | 中文

## Problem

T1–T8 在隔离 Loader 夹具上证明了 IM 域、适配器、工具、模拟和 GUI。随附的 `dsh --profile` 表层仍未挂 `imConfig` / `imDelivery` / `imExecution` / `imSimulation`，因此 Web GUI 只能改内存原型快照，无法经 Host 持久化账号或路由。

## Decision

`@deepseek-ai/dsh-base` 在 `subprocess` 之后插入五行 Host：`im-config`（`@deepseek-ai/dsh-im-core`）、`im-delivery`（`@deepseek-ai/dsh-im-core/delivery`）、`im-execution`（`@deepseek-ai/dsh-im-core/coordination`）、`im-simulation`（`@deepseek-ai/dsh-im-core/simulation`），以及空闲的 `@deepseek-ai/dsh-im-dingtalk`。钉钉挂载时不调用 `startConsumer`，因此空 profile 不会拉起 DWS。旺旺不进共享核心，因为 `validateWangwangConfig` 在没有准入商户目录时会失败。

## Alternatives considered

**用空的 `admittedMerchants` 挂旺旺。** 否决，因为适配器构造会解析必填商户目录，会导致每个 base-backed profile 加载失败。

**把 IM 只作为后续 overlay。** 否决，因为 Web GUI 与工具将没有可绑定的 Host 服务，内存原型会继续作为唯一产品表面。

**为每个已连接账号自动启动钉钉消费者。** 否决，因为真实 DWS 登录与出站仍需另行授权；空闲挂载是安全默认。

## Consequences

基于 base 的 web、headless、sdk 与 acp profile 会加载 IM Host 服务。Web GUI 经 `imConfig` remotes 持久化账号、路由与模拟目标；`imDelivery` remotes 与旺旺商户 overlay 仍是后续工作。真实钉钉消费、真实出站和真实模型 round 仍需另行授权。

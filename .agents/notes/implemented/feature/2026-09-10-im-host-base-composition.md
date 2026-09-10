# Agent Note: IM Host composition on dsh-base

Status: implemented

English | [中文](2026-09-10-im-host-base-composition.zh.md)

## Problem

T1–T8 prove IM domain, adapters, tools, simulation, and GUI on isolated Loader fixtures. Shipped `dsh --profile` surfaces still omit `imConfig` / `imDelivery` / `imExecution` / `imSimulation`, so the Web GUI can only mutate an in-memory prototype snapshot and cannot persist accounts or routes through the Host.

## Decision

`@deepseek-ai/dsh-base` inserts five Host rows after `subprocess`: `im-config` (`@deepseek-ai/dsh-im-core`), `im-delivery` (`@deepseek-ai/dsh-im-core/delivery`), `im-execution` (`@deepseek-ai/dsh-im-core/coordination`), `im-simulation` (`@deepseek-ai/dsh-im-core/simulation`), and idle `@deepseek-ai/dsh-im-dingtalk`. DingTalk does not call `startConsumer` at mount, so an empty profile does not spawn DWS. Wangwang stays out of the shared core because `validateWangwangConfig` fails without an admitted merchant directory.

## Alternatives considered

**Mount Wangwang with empty `admittedMerchants`.** Rejected because the adapter constructor parses a required merchant directory and would fail every base-backed profile load.

**Keep IM as a later overlay only.** Rejected because Web GUI and tools then have no Host services to bind; the in-memory prototype would remain the only product surface.

**Auto-start DingTalk consumers for every connected account.** Rejected because live DWS login and outbound stay separately authorized; idle mount is the safe default.

## Consequences

Base-backed web, headless, sdk, and acp profiles load IM Host services. The Web GUI persists accounts, routes, and simulation targets through `imConfig` remotes; `imDelivery` remotes and Wangwang merchant overlays remain later work. Live DingTalk consume, live outbound, and real model rounds stay separately authorized.

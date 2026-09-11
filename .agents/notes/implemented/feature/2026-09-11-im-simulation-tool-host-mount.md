# Agent Note: IM simulation tool Host mount

Status: implemented

English | [中文](2026-09-11-im-simulation-tool-host-mount.zh.md)

## Problem

Simulation tools existed and tests called `registerSimulationTools` by hand, but the product Host never mounted them. Binding a simulation target in workspace settings therefore did not give that workspace's Agent `im_sim_create` / `im_sim_stop` / send tools.

## Decision

`ImSimulationService` waits for `tools` and `agents`, then registers simulation tools on each Agent's scoped `agent.ctx` when that Agent's session cwd maps to a workspace with a simulation target. `setSimulationConfig` / `deleteSimulationConfig` emit `imConfig/simulation-target` so only matching Agents refresh. Tested-agent workspaces and unbound sessions receive no simulation tools. Simulated outbound still settles locally and never flushes DingTalk or Wangwang adapters.

## Alternatives considered

**Register simulation tools globally like `im_send_message`.** Rejected because the spec gates tools to the simulated-user workspace; a tested Agent must not gain them by becoming a target.

**Keep `registerSimulationTools` as a test-only hook.** Rejected because the GUI already persists simulation targets through `imConfig` remotes; Host must honor that binding.

**Mount through user `tool-eligibility` settings.** Rejected because eligibility is an allow-only overlay; simulation tools must appear from Host domain state, not from a Settings map.

## Consequences

A simulated-user Agent whose workspace has a configured target sees simulation tools without a model round or live IM consume. Clearing the target drops those tools. Live DingTalk login, live Wangwang reads, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.

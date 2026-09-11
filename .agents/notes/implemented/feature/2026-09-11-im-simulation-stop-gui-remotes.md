# Agent Note: IM simulation stop GUI remotes

Status: implemented

English | [中文](2026-09-11-im-simulation-stop-gui-remotes.zh.md)

## Problem

The Sidebar could create a Host simulation instance and inject a member inbound, but stopping the instance still required an Agent tool call. After a GUI proof run the instance stayed `running`.

## Decision

`ImSimulationService.stopInstance` is a GUI Remote. Simulated-user role with a running instance shows Stop simulation instance; the Host call is terminal. After stop, `selectedStreamScope` falls back to the real GUI scope and Create simulation instance returns.

## Alternatives considered

**Drive stop only through `im_sim_stop`.** Rejected because proving the terminal state in the Sidebar would require an authorized model round.

**Allow resume after stop.** Rejected: domain stop is already terminal.

## Consequences

The Sidebar can stop a local simulation instance without live DingTalk, Wangwang, or a model round. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.

# Agent Note: IM simulation GUI remotes

Status: implemented

English | [中文](2026-09-11-im-simulation-gui-remotes.zh.md)

## Problem

Simulation tools already mount on Agents whose workspace has a target, but the Sidebar conversation tab still read a real `gui-all` scope. Creating an instance required a model tool call, and simulated inbound never appeared in the GUI stream.

## Decision

`ImSimulationService` extends `TypertRemoteService` and exposes GUI adapters `listInstances` and `createInstance`. GUI `createInstance` takes `{ workspaceId }`; Host fills the conversation id from the workspace target (`gui-all` when the target is all-scope). `ui-im` injects `remote.imSimulation`. Simulated-user role reads a running instance through `imDelivery` history and outbound; Create simulation instance queues that Host create without flushing adapters. Tested-agent role keeps the real GUI scope.

## Alternatives considered

**Drive instance create only through `im_sim_create`.** Rejected because proving the stream would require an authorized model round.

**Put full instance records with unconstrained payloads on the wire.** Unnecessary: instance records are already Typert-safe branded fields.

**Keep the Sidebar on the real `gui-all` scope after tools mount.** Rejected because simulated inbound would stay invisible.

## Consequences

The Sidebar can create a local simulation instance and list its Host stream without live DingTalk, Wangwang, or a model round. Simulated outbound still settles locally. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.

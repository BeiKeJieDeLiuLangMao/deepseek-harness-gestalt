# Agent Note: IM tested-agent simulation stream

Status: implemented

English | [中文](2026-09-11-im-simulation-tested-stream.zh.md)

## Problem

The Sidebar simulated-user role could create an instance and inject a member inbound, but the tested-agent role still read the real `gui-all` scope. Switching roles hid the simulated stream.

## Decision

`selectedStreamScope` binds both simulated-user and tested-agent roles to a running instance. Simulated-user matches `workspaceId`; tested-agent matches `testedWorkspaceId` from the takeover rule covering the real GUI scope. Manual send on the tested role still uses that sim scope and does not flush adapters.

## Alternatives considered

**Keep tested-agent on the real GUI scope.** Rejected: the product stream for a takeover proof is the simulated conversation, not an empty real `gui-all`.

**Give tested-agent its own instance id.** Unnecessary: one frozen instance already names both workspaces.

## Consequences

Both conversation-tab roles inspect the same local simulation stream without live DingTalk, Wangwang, or a model round. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.

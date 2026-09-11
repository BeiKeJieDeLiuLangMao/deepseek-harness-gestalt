# Agent Note: IM role switch reopens the conversation tab

Status: implemented

English | [中文](2026-09-11-im-role-reopens-conversation-tab.zh.md)

## Problem

Opening the simulated-user or tested-agent Session switches the current Session. Right-sidebar tabs belong to that Session, so the IM conversation tab disappeared and had to be reopened from the Start catalog.

## Decision

`ui-im` injects `sidebarRight`. After `uiWorkspace.openWorkspace` lands on the role Session, `setRole` calls `sidebarRight.openTab('im-conversation')` so the conversation tab is present on the new Session.

## Alternatives considered

**Keep the IM tab only on the Session that first opened it.** Rejected: switching roles is the product path between simulated-user and tested-agent, and the stream must stay visible.

**Pin the IM tab across Sessions.** Out of scope: right-sidebar occurrences are Session-owned.

## Consequences

Role buttons still open the bound workspace Session. The IM conversation tab follows that Session without live DingTalk, Wangwang, or a model round. Live consume, live outbound, real model rounds, and native Desktop computer-use stay separately authorized.

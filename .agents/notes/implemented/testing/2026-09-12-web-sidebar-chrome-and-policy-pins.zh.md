# Agent Note: 官方 Sidebar chrome pin、model-selection-policy fixture 与 Browser Dock 座位

Status: implemented

[English](2026-09-12-web-sidebar-chrome-and-policy-pins.md) | 中文

## Problem

官方 Sidebar 融合后，0.1.5 合入的 required `node 24 / snapshots and artifacts` 失败。Web ARIA golden 仍使用 Better chrome（`More actions`、`Open right sidebar`、`Open the sidebar`）。live Session fixture 缺少 `subagent/model-selection-policy`。`browser-dock` e2e 等待 Better toggle cluster，并把屏外 page chrome 当成已打开。Annotation persistence 仍定位 textarea composer，且缺少 `session.jsonl`。

## Decision

Web expected Markdown 使用官方 chrome：`Open sidebar` 与 `Open the bottom panel`。发出 `approval/policy` 的 live v3 Session fixture 同时记录 `subagent/model-selection-policy`（`allowedModels: []`），通过 `DSH_SNAPSHOT=refresh` 刷新，而不是手改 seq。`browser-dock` 的 v3 header 带 `isSeeded` 与 `delegationDepth`，先打开折叠预览再打开官方 Sidebar，且仅在 page chrome 占据视口时视为 shown。Annotation persistence 使用 contenteditable composer、`textContent`、`authenticatedUrl`，以及 override 旁的仅含 header 的 `session.v3.jsonl`。官方 Browser 恢复路径的 tripwire 忽略 Runtime 重新绑定时预期的 `browser target is not present` 页面错误。

## Alternatives considered

**把手插的 `subagent/model-selection-policy` 写进每个 `session.v3.jsonl` 和 `session.v2.jsonl`。** 否决：v2 没有该事件；不经 refresh 插入一行会错位后续 `sourceEventSeqs`。

**`browser-dock` 继续使用 Better 的 `data-dsh-toggle-cluster` 与 `dsh-sidebar:v1`。** 否决：官方 page chrome 在 Sidebar tab 中；持久化键是 `dsh-sidebar-workbench:v1`。

**把缺失截图当成 golden 放宽。** 否决：Host `screenshot` 已返回 PNG；observe 稳定后客户端必须绘制它。

## Consequences

命名 Sidebar chrome 的 Web ARIA golden 必须对齐官方 locale key。记录 `approval/policy` 的 compareReplay v3 fixture 必须从 refresh 同时记录空的 `subagent/model-selection-policy`。Browser Dock e2e 必须打开官方 Sidebar 座位，而不是 Better DockKit cluster。

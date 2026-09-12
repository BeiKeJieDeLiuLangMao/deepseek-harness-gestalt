# Agent Note: 官方 Sidebar 座位、projected v3 fixture 与 live tool-catalog harvest

Status: implemented

[English](2026-09-12-official-sidebar-web-e2e-pins.md) | 中文

## Problem

官方 Sidebar 融合与 Session v3 projection 之后，0.1.5 合入的 required snapshots 与 coverage 失败。Web e2e 仍等待 Better DockKit Files 树、`容量 N` 披露和 45% 右栏宽度。`desktop-chrome` 回放 packed v3 JSONL，缺少 `delegationDepth`，且仍携带已退役的 `request/header.system`。Side Chat replay 仍指向 `session.jsonl` 和 v0 child log。默认 subagent 配置下 `collectToolCatalog` 不再 harvest `list_subagent_models`。

## Decision

Web e2e 通过 `[data-sidebar-right-expand]`、Files guide entry 与 `data-files-state="tree"` 坐进官方 Sidebar。DeepSeek 模型容量使用 `高级设置 N`。右栏几何使用 `defaultWidthPercent` 35。`produced-files.overlay.yml` 为无头 CI 钉死 `nativeOpen`。`desktop-chrome` 与 Side Chat child log 是 projected v3 Session fixture：带 `delegationDepth: 0`、没有 packed `assistant/chunk` 行、也没有退役的 header.system。Side Chat replay 读取 `session.v3.jsonl`。Catalog harvest pin 省略 `list_subagent_models`，除非挂载了 model-selection settings。

## Alternatives considered

**把手插的 `delegationDepth` 写进 packed desktop-chrome JSONL。** 否决：当前 projected fixture 不能含 packed 行，且 v3 `request/header` 拒绝 `system`。

**把 Side Chat child replay 继续留作 v0 仅含 chunk 的 log。** 否决：`loadSessionScripts` 现在按当前格式 restore，child log 必须是完整的 projected Session。

**把缺失 Files 树当成 golden 放宽。** 否决：官方 Sidebar 从 guide 起步；e2e 必须打开 Files entry，而不是假设已有 seeded tree。

## Consequences

打开右栏的 Web e2e 必须等待官方 expand，若 tree 不在再打开 Files。发出 `approval/policy` 的 live Session pin 仍是 refresh 拥有的 projected v3 产物。Catalog 测试跟随默认 harvest 的名字，而不是组合稍后才能启用的每个工具。

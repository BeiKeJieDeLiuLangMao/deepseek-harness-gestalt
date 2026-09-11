# Agent Note: IM 角色切换后重新打开对话标签

Status: implemented

[English](2026-09-11-im-role-reopens-conversation-tab.md) | 中文

## Problem

打开模拟用户或被测 Agent Session 会切换当前 Session。右侧栏标签属于该 Session，因此 IM 对话标签会消失，只能从「开始」目录再开一次。

## Decision

`ui-im` 注入 `sidebarRight`。`uiWorkspace.openWorkspace` 落到角色 Session 后，`setRole` 调用 `sidebarRight.openTab('im-conversation')`，让对话标签出现在新 Session 上。

## Alternatives considered

**IM 标签只留在第一次打开它的 Session。** 否决：角色切换就是模拟用户和被测 Agent 之间的产品路径，对话流必须保持可见。

**把 IM 标签钉在所有 Session 上。** 超出本期：右侧栏 occurrence 归 Session 所有。

## Consequences

角色按钮仍打开绑定工作区 Session。IM 对话标签跟着该 Session 走，无需真实钉钉、旺旺或模型 round。真实消费、真实出站、真实模型 round 和原生 Desktop computer-use 仍需单独授权。

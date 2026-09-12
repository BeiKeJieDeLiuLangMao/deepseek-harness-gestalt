# Agent Note: 关闭工作台最后一个标签会收起面板

Status: implemented

[English](2026-09-04-last-workbench-tab-collapses-panel.md) | 中文

## Problem

关闭右侧或底部工作台最后一个停靠标签后，空面板仍保持打开。剩下的欢迎卡片占着对话栏，用户已经关完标签，工作台却像没收完。

## Decision

官方 `ui-sidebar-right` 的 `closeTab` 只收起丢掉最后一个停靠标签的那块表面。是否为空不看浮动窗口，因此剩下的浮动窗口不会让空的停靠树保持打开。把最后一个停靠标签拖成浮动窗口不会收起面板。之后的内容打开仍会展开落地面板。未使用的 Better snapshot store 不再持有这条路径。

## Alternatives considered

**任一棵树为空就同时收起两侧面板。** 未采用，因为未使用的那棵树一开始就是空的；关掉右侧文件也会把底部工作台藏掉。

**留下空的欢迎卡片。** 未采用，因为用户已经关掉最后一个标签；关完后还开着就是缺陷。

## Consequences

关掉最后一个标签后空工作台会收起。再打开文件或 URL 会重新展开。纯类型的 `+` 点击仍不会展开已收起的面板。

## Testing

`packages/client/ui-sidebar-right/tests/stores.client.spec.ts` 分别关掉最后一个非引导停靠标签、仍有兄弟标签时的关闭，以及不得收起栏的浮动标签。

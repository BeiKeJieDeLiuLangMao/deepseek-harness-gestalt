# Agent Note: Terminal 单一滚动 owner

Status: implemented

[English](2026-09-10-terminal-single-scroll-owner.md) | 中文

## Problem

DockKit 把每个格正文都做成通用纵向滚动容器。Terminal 正文同时会占满格，并让 xterm 提供自身的纵向 viewport，因此终端输出会在 xterm 滚动条旁再产生一条外层格滚动条。滚动可能移动整个 Terminal 正文，而不只是终端缓冲区。

## Decision

DockKit 支持在标签正文根节点上标记 `data-dockkit-scroll-owner`。包含该标记的格会变成裁切溢出的 flex 列，并把纵向滚动交给子节点。后代匹配会穿过 keyed Slot 插入的 `display: contents` 包装层；没有该标记的正文保留通用格滚动条。

Better Sidebar 在 Terminal 根节点上添加该属性。其现有 flex 与最小高度规则会占满格，而 xterm viewport 保持为唯一的纵向滚动容器。

## Alternatives considered

**隐藏每个格正文的溢出。** 放弃该方案，因为没有内部滚动容器的文档与 viewer 依赖 DockKit 的通用格滚动。

**通过生成的 CSS class 定位 Terminal。** 放弃该方案，因为 DockKit 不持有 Better Sidebar 的哈希 class name，这会让跨包样式表关系变得隐式。

**隐藏 xterm 滚动条。** 放弃该方案，因为 xterm 持有缓冲区滚动，必须保留其原生滚动位置与交互。

## Consequences

Terminal 输出只在 xterm 内滚动，其他标签正文保留原有 DockKit 滚动行为。未来自带滚动的正文只有在填满格并把标记放在根节点上时才能选择该行为。

## Testing

Desktop 验收检查带标记的 Terminal 根节点位于格正文内、格正文隐藏溢出且 scroll height 与 client height 相等，以及 xterm viewport 保留纵向滚动。

# Agent Note: 删除未使用的 Web Search 提供方面板和 useThis

Status: proposed

[English](2026-08-19-drop-dead-web-search-provider-panel.md) | 中文

## Problem

Web Search 设置外壳是一张卡片，字段画在 [`WebSearchCard.tsx`](../../../../packages/client/ui-settings-plugins/src/client/WebSearchCard.tsx) 里。内联之后，[`WebSearchProviderPanel.tsx`](../../../../packages/client/ui-settings-plugins/src/client/WebSearchProviderPanel.tsx) 没有生产渲染器：`WebSearchCard` 把 `renderSlot` 空掉了，因此三条 `settings.plugin.web-search.provider` 注册不会上屏。生产路径仍要负担一个 list 槽、三次 panel inject，以及必须与卡片保持同步的第二套字段布局。

`WebSearchCardFace.useThis` 是同一批残留。Tab 调用 `selectProvider`；唯一的 `useThis()` 调用方是 [`stores.client.spec.ts`](../../../../packages/client/ui-settings-plugins/tests/stores.client.spec.ts)。[`section.client.spec.tsx`](../../../../packages/client/ui-settings-plugins/tests/section.client.spec.tsx) 里的 panel 套件是该未用组件的另一个消费者。

list 槽本身仍有生产职责：它是其他插件注册 tab 的账本。那不是死代码。死成本是未使用的字段组件和未使用的 `useThis` 动作。

## Proposal

删除 `WebSearchProviderPanel.tsx` 及其 section 测试。保留 `settings.plugin.web-search.provider` 作为 `{ id, label, inject }` 列表，好让其他插件仍能加 tab；三张自带行不再挂字段组件。从 `WebSearchCardFace` 去掉 `useThis`，并删掉只为点击它而存在的 store 测试。写入 `backend` 仍只走 `selectProvider`。

## Alternatives considered

**留下 panel，好让其他插件带自定义字段。** 其他插件本来就可以往 list 槽 inject 别的组件。今天父级从不调用 `renderSlot`，这条扩展路径已经是暗的。为自定义字段恢复 `renderSlot` 是产品改动，不是保留一套未用默认 panel 的理由。

**把 `useThis` 留作测试隐藏 API。** store 测试可以通过 `selectProvider` 或 settings scope 写 `backend`。UI 并不提供的第二条写入路径，正是本条要去掉的成本。

## Acceptance criteria

- 精确符号搜索最多只在本 Agent Note 里看到 `WebSearchProviderPanel` 和 `useThis`。
- 已发货的 Web Search 卡片仍列出 DeepSeek、Anthropic、Kimi tab，点击 tab 仍写入 `backend`。
- 其他插件仍能注册 `settings.plugin.web-search.provider` 行并显示为 tab。
- 客户端插件测试和 plugin-config 快照在没有第二套字段布局时仍为绿。

## Risks

以后若要按 tab 自定义字段，必须恢复 `renderSlot` 和子组件。那比在此之前维护两套布局更便宜。

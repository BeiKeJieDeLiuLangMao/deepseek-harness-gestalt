# Agent Note: Drop the unused Web Search provider panel and useThis

Status: proposed

English | [中文](2026-08-19-drop-dead-web-search-provider-panel.zh.md)

## Problem

The Web Search settings chrome is one card whose fields live in [`WebSearchCard.tsx`](../../../../packages/client/ui-settings-plugins/src/client/WebSearchCard.tsx). After that inlining, [`WebSearchProviderPanel.tsx`](../../../../packages/client/ui-settings-plugins/src/client/WebSearchProviderPanel.tsx) has no production renderer: `WebSearchCard` voids `renderSlot`, so the three `settings.plugin.web-search.provider` registrations never paint. Production still pays for a list slot, three panel injects, and a second field layout that must stay in lockstep with the card.

`WebSearchCardFace.useThis` is the same leftover. Tabs call `selectProvider`; the only `useThis()` caller is [`stores.client.spec.ts`](../../../../packages/client/ui-settings-plugins/tests/stores.client.spec.ts). The panel suite in [`section.client.spec.tsx`](../../../../packages/client/ui-settings-plugins/tests/section.client.spec.tsx) is the only other consumer of the unused component.

The list slot itself still has a production job: it is the tab ledger extra plugins register into. That is not dead. The dead cost is the unused field component and the unused `useThis` action.

## Proposal

Delete `WebSearchProviderPanel.tsx` and its section tests. Keep `settings.plugin.web-search.provider` as a list of `{ id, label, inject }` faces so extra plugins can still add a tab; stop attaching a field component to the three shipped rows. Drop `useThis` from `WebSearchCardFace` and the store test that only exists to click it. `selectProvider` remains the one write of `backend`.

## Alternatives considered

**Keep the panel so extra plugins can ship custom fields.** Extra plugins can already inject a different component into the list slot. Today the parent never calls `renderSlot`, so that extension path is already dark. Restoring `renderSlot` for custom fields is a product change, not a reason to keep an unused default panel.

**Keep `useThis` as a hidden API for tests.** The store test can write `backend` through `selectProvider` or the settings scope. A second write path that the UI does not offer is the cost this note removes.

## Acceptance criteria

- Exact-symbol search finds `WebSearchProviderPanel` and `useThis` only in this Agent Note, if at all.
- The shipped Web Search card still lists DeepSeek, Anthropic, and Kimi tabs and still writes `backend` on tab click.
- Extra plugins can still register `settings.plugin.web-search.provider` rows that appear as tabs.
- Client plugin tests and the plugin-config snapshot stay green without a second field layout.

## Risks

A later change that wants per-tab custom fields must restore `renderSlot` and a child component. That is cheaper than maintaining two layouts until then.

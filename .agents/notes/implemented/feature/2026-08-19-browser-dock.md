# Agent Note: Native Browser Dock

Status: implemented

English | [中文](2026-08-19-browser-dock.zh.md)

## Problem

A Session can own Browser Workspaces, instances, tabs, Dock geometry, and the current control owner, but the Session Surface still had no native pane for those facts. Embedding another Electron BrowserView would split ownership with the Desktop Host. A second Dock in conversation history would duplicate the same occupant.

## Decision

`dsh-client-ui-browser` presents the Session-owned Browser Workspace as one native details occupant and one collapsed preview of that same occupant. The expanded Dock occupies `details` as `id: 'browser'` while this Session owns tabs and `dockOpen` is true. The collapsed preview occupies `conversation.browser.preview` otherwise. Live facts arrive through `useProjection('browserWorkspace')`. Mutations go through the generated `remote.browserWorkspace` namespace.

The Dock has no Profile switch or Agent-status row. Tabs occupy the top row and collapse stays at the right edge. Persistent Profile names appear only next to the address field. Refresh reloads the last observed URL. Take-control and return-to-Agent write the same `controlOwner` the Workspace snapshot already persists. The viewport shows the latest screenshot and page text; it does not embed a second process.

The first Agent tab opens the Dock. After the human collapses it, later Agent activity does not steal it open. A collapsed preview is a one-line layered summary of the same Dock. Clicking a back layer focuses that tab with its listed revision; clicking the current layer opens the Dock. The preview is hidden while the Dock is visible. Ordinary MCP tool rows stay in conversation history.

The occupant-specific details range is 420/640/960 px from [#60](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/60). Session switch restores per-Session visibility, width, instances, tabs, current control owner, and each tab's last committed revision from the Workspace projection owned by [#67](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/67). Focus and close send the addressed tab's listed revision; the [Dock tab revision Agent Note](../bug-fix/2026-08-20-dock-tab-revision.md) owns that contract.

Web and headless compositions mount `dsh-browser-runtime-deterministic` plus `dsh-browser-workspace` so the Dock has a Session-owned Runtime without Electron. The Host composition also inserts `dsh-tool-browser`; Web composition disables that host-plane row so the standard, code, and cordis presets remount it, matching `tool-web`, and mounts the Dock plugin. Desktop Host owns in-process Electron `webContents` and the overlay HTTP client; the Dock still renders screenshot, title, and text and does not embed a second BrowserView.

DetailsPanel (`id: 'tool'`) renders nothing when the chat store has no selection, so the details list stays empty unless a tool call is selected or the Dock is open. ChatView always requests `conversation.browser.preview`; the preview plugin hides itself while the Dock is visible. The Dock viewport rebinds the elevated scrollbar pair because it paints `--dsw-alias-bg-module-platform` and the page-text overlay scrolls inside it.

## Alternatives considered

**Embed a Desktop-owned Electron BrowserView.** Rejected because DeepSeek Gestalt must own the Dock occupant; a second process would split page identity from the Session Workspace.

**Keep a second live card in conversation while the Dock is open.** Rejected because the preview is a reopen path for the same Dock, not a second Dock.

**Store Dock open and width only in the layout store.** Rejected because each Session must restore those facts after switch and reload.

## Consequences

Human and Agent share one Dock over the same Session-owned tab identities. Collapse is a Session fact, so later Agent activity cannot steal the pane open. Web and Desktop render the same occupant; neither embeds a second BrowserView. Release remains a later ticket.

## Verification

- `pnpm exec vitest run packages/client/ui-browser packages/browser/browser-workspace packages/client/ui-layout packages/client/ui-conversation/tests/gate-branch-tails.client.spec.tsx packages/client/ui-conversation/tests/chat-apply.client.spec.tsx`
- `pnpm exec vitest run packages/client/ui-browser --coverage --coverage.include='packages/client/ui-browser/src/**/*.ts'`
- `pnpm run check:ci:static`

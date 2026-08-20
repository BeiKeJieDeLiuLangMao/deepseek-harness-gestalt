# @deepseek-ai/dsh-client-ui-browser

English | [中文](README.zh.md)

Session-owned Browser Dock and collapsed tab preview. The plugin occupies `details` as `id: 'browser'` at order 10 while this Session owns tabs and `dockOpen` is true, and occupies `conversation.browser.preview` otherwise. Live Workspace facts arrive through `useProjection('browserWorkspace')`. Mutations go through the generated `remote.browserWorkspace` namespace.

The expanded Dock has no Profile switch or Agent-status row. Tabs occupy the top row and the collapse control stays at its right edge. The toolbar shows refresh, the persistent Profile name or shared-identity label next to the address field, and take-control or return-to-Agent for the current tab. The viewport shows the latest screenshot and page text. The active tab's label, address, and screenshot follow the Binder-committed page after `navigate` and after Refresh. A still-blank first tab can remain `about:blank` until that navigate. The first Agent tab opens the Dock; later Agent activity does not reopen it after the human collapses it.

The collapsed preview is a one-line layered summary of the same Dock, not a second Dock. It has no outer shell or footer. Clicking a back layer focuses that tab with its listed revision; clicking the current layer opens the Dock. A listed-revision `BROWSER_REVISION_CONFLICT` on a background chip observes that tab once and retries, or shows the failure. The preview is hidden while the Dock is visible. Ordinary MCP tool rows stay in conversation history. Selecting a `browser_*` tool row focuses the listed tab and does not change `dockOpen` ([decision](../../../.agents/notes/implemented/feature/2026-08-20-chat-browser-tool-focus-dock.md)).

The occupant-specific details range is 420/640/960 px. Session switch restores per-Session visibility, width, instances, tabs, current control owner, and each tab's last committed revision from the Workspace projection. Focus and close send that listed revision for the addressed tab. A `BROWSER_REVISION_CONFLICT` on that row observes the tab once and retries, or shows the failure.

The behavior is specified by the [Browser Dock Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-browser-dock.md).

## Model Experience

None, as this human-facing Dock chrome adds no tools, messages, prompts, or provider requests; page operations stay on `dsh-tool-browser`.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Screenshot viewport, not a live WebContentsView** — the Dock renders observe and screenshot facts from the Session-owned Runtime; it does not embed a second BrowserView.
- **Keyless web and headless Runtimes stay deterministic** — browser `dsh web` and headless keep `dsh-browser-runtime-deterministic`. Desktop Host owns in-process Electron `webContents` and points the overlay HTTP client at that loopback origin.

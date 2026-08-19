# @deepseek-ai/dsh-browser-workspace

English | [中文](README.zh.md)

Session-owned Browser Workspace binder. `ctx.browserWorkspace` binds Browser Runtime identities to one Session log so each Session independently owns zero or more Workspaces, instances, and tabs.

## Service API

`create`, `navigate`, `observe`, `screenshot`, `focus`, `input`, `takeover`, `returnControl`, and `close` require the owning `Session`. A missing Session ownership rejects with `BROWSER_SESSION_MISMATCH`. A target already owned by another live Session rejects with `BROWSER_TRANSFER_UNSUPPORTED`. `create` also rejects attach to another live Session's Workspace or instance with `BROWSER_TRANSFER_UNSUPPORTED`, and attach unknown to this Session with `BROWSER_SESSION_MISMATCH`. `input` and `takeover` persist `controlOwner: human` on the Session snapshot; `returnControl` and Agent mutations persist `agent`. `setDock` records whether the Dock is open and the preferred width as Session facts. `snapshot` and `foldBrowserWorkspace` return the last logged whole Workspace, or the empty Workspace before the first change. `cleanup` closes leftover live Runtime tabs, forgets them from the Session snapshot, and is the returned work of `session/disposed`.

`browser/workspace` is a log-only, last-wins `SessionEventMap` member. When `ctx.sessionProjections` is composed, the package registers the `browserWorkspace` unit. Cross-Session page transfer is not supported.

## Model Experience

Indirectly, through dsh-tool-browser when a calling Agent Session is present. The Binder itself adds no model tokens.

#### KV Cache effect

Logged Workspace snapshots do not enter derived model history.

## Known Limitations and Deferred Work

- Dock UI remains later work. This package persists Dock open and width plus each tab's current control owner.
- Headless Browser Runtime snapshots compose Runtime and Consumer only. Session isolation is Binder-owned and is not claimed for those Binder-free traces.

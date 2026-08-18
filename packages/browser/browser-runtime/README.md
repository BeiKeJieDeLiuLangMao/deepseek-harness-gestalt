# @deepseek-ai/dsh-browser-runtime

English | [中文](README.zh.md)

Provider-neutral Service Definition for browser control. `ctx.browserRuntime` creates a temporary or named persistent Browser Profile hierarchy and addresses every operation with branded `BrowserProfileId`, `BrowserWorkspaceId`, `BrowserInstanceId`, and `BrowserTabId` values.

## Service API

`create` returns the initial open state at revision `0`. A temporary request discards identity on close. A persistent request names one Browser Profile and restores the same `persist:session-*` partition later. `navigate`, `focus`, and `close` require the caller's last observed `expectedRevision`; Providers serialize operations and reject stale mutations with `BROWSER_REVISION_CONFLICT`. A second open writer of the same named Profile rejects with `BROWSER_PROFILE_BUSY`. `observe` and `screenshot` are read-only. `close` returns a terminal receipt that retains all four opaque identities. Open state carries address-field `chrome` and partition-backed `storage`; temporary chrome omits a label. Each method documents its applicable stable `BrowserRuntimeError` codes at the Service Definition.

`BrowserRuntimeState` carries open, `unavailable`, and closed states. An `unavailable` state is the truthful projection of Provider availability loss for an existing target: it retains the target and last revision, names the reason (`crashed`, `unhealthy`, or `reconnect-failed`), and flags an in-flight reconnect; it is not the terminal closed receipt. Operations on an unavailable target reject with `BROWSER_RUNTIME_UNAVAILABLE`; Providers that cannot interpret their backend's responses reject with `BROWSER_PROTOCOL`.

Providers publish committed states on `browser/runtime-state`. The notification is non-vetoing: each synchronous throw or asynchronous rejection is contained, later listeners still run, and asynchronous listener work is not awaited. The stateful Provider owns validation of that mutable relationship; this definition package owns only types, the service name, and the shared queue, identity, and notification helpers Providers call.

## Model Experience

Indirectly, through the dsh-tool-browser Consumer that renders Browser Runtime results.

#### KV Cache effect

This package alone adds no model tokens and changes no request prefix.

## Known Limitations and Deferred Work

- The Service Definition expresses temporary and named persistent Profiles for one tab; multiple Workspaces and tabs, human takeover, and Dock chrome remain later work.

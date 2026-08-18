# @deepseek-ai/dsh-browser-runtime

English | [中文](README.zh.md)

Provider-neutral Service Definition for browser control. `ctx.browserRuntime` creates one temporary Profile hierarchy and addresses every operation with branded `BrowserProfileId`, `BrowserWorkspaceId`, `BrowserInstanceId`, and `BrowserTabId` values.

## Service API

`create` returns the initial open state at revision `0`. `navigate`, `focus`, and `close` require the caller's last observed `expectedRevision`; Providers serialize operations and reject stale mutations with `BROWSER_REVISION_CONFLICT`. `observe` and `screenshot` are read-only. `close` returns a terminal receipt that retains all four opaque identities. Each method documents its applicable stable `BrowserRuntimeError` codes at the Service Definition.

Providers publish committed states on `browser/runtime-state`. The notification is non-vetoing: each synchronous throw or asynchronous rejection is contained, later listeners still run, and asynchronous listener work is not awaited. The stateful Provider owns validation of that mutable relationship; this definition package owns only types and the service name.

## Model Experience

Indirectly, through the dsh-tool-browser Consumer that renders Browser Runtime results.

#### KV Cache effect

This package alone adds no model tokens and changes no request prefix.

## Known Limitations and Deferred Work

- The Service Definition expresses the temporary one-tab tracer only; persistent isolation, multiple Workspaces and tabs, and a real Electron backend belong to later capability Providers.

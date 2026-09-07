---
description: "The Browser Runtime package group: provider-neutral browser control, deterministic and Desktop providers, Session ownership, and model-facing tools."
kind: "package-group"
---

# browser/ — Browser Runtime capability family

English | [中文](README.zh.md)

## Summary

The `browser/` group defines provider-neutral browser control, a deterministic keyless Provider, an in-process Electron Provider, a Tandem-shaped HTTP protocol client, a Session-owned Workspace binder, and deferred model-facing tools. Desktop Host ships the Electron Provider on macOS and Windows. Linux is out of scope.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Six packages split the Browser Runtime Service Definition, Providers, Session binding, and model-facing Consumer.

| Package | Role | ctx key |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition and opaque identity vocabulary | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | Deterministic temporary, named persistent, and shared Profile Provider | provides `ctx.browserRuntime` |
| [`browser-runtime-electron/`](browser-runtime-electron/README.md) | In-process Electron Provider for temporary, named persistent, and shared Profiles | provides `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.md) | Tandem-shaped HTTP protocol client for temporary, named persistent, and shared Profiles | provides `ctx.browserRuntime` |
| [`browser-workspace/`](browser-workspace/README.md) | Session-owned Browser Workspace binder | `ctx.browserWorkspace` |
| [`tool-browser/`](tool-browser/README.md) | Deferred model-facing Consumer | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Browser Runtime subsystem](../../docs/subsystems/browser-runtime.md) — shared types, lifecycle, providers, and tools.
- [Temporary Browser Runtime](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md) — temporary Profile lifecycle and discovery.
- [Electron Browser Runtime](../../.agents/notes/implemented/feature/2026-08-19-electron-browser-runtime.md) — the Desktop Host engine.
- [Tandem Provider](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.md) — the HTTP protocol client.
- [Persistent Browser Profiles](../../.agents/notes/implemented/feature/2026-08-19-persistent-browser-profiles.md) — named-partition isolation and single-writer rules.
- [Shared default Browser Profile](../../.agents/notes/implemented/feature/2026-08-20-shared-default-browser-profile.md) — the omitted-profile default.
- [Session Browser Workspace](../../.agents/notes/implemented/feature/2026-08-19-session-browser-workspace.md) — Session-local ownership.
- [Browser control arbitration](../../.agents/notes/implemented/feature/2026-08-19-browser-control-arbitration.md) — human and Agent ownership of one tab.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

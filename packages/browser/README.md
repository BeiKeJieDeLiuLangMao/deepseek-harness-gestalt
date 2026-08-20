# browser/ — Browser Runtime capability family

English | [中文](README.zh.md)

This family defines provider-neutral browser control, a deterministic keyless Provider, an in-process Electron Provider, a Tandem-shaped HTTP protocol client, a Session-owned Workspace binder, and deferred model-facing tools. Desktop Host ships the Electron Provider on macOS and Windows. Linux is out of scope.

| Package | Role | ctx key |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition and opaque identity vocabulary | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | Deterministic temporary, named persistent, and shared Profile Provider | provides `ctx.browserRuntime` |
| [`browser-runtime-electron/`](browser-runtime-electron/README.md) | In-process Electron Provider for temporary, named persistent, and shared Profiles | provides `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.md) | Tandem-shaped HTTP protocol client for temporary, named persistent, and shared Profiles | provides `ctx.browserRuntime` |
| [`browser-workspace/`](browser-workspace/README.md) | Session-owned Browser Workspace binder | `ctx.browserWorkspace` |
| [`tool-browser/`](tool-browser/README.md) | Deferred model-facing Consumer | registers on `ctx.tools` |

The subsystem reference is [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md). The [temporary Browser Runtime Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md) records lifecycle and discovery; the [in-process Electron Browser Runtime Agent Note](../../.agents/notes/implemented/feature/2026-08-19-electron-browser-runtime.md) records the Desktop Host engine; the [Tandem provider Agent Note](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.md) records the HTTP protocol client; the [persistent Browser Profile Agent Note](../../.agents/notes/implemented/feature/2026-08-19-persistent-browser-profiles.md) records named-partition isolation and single-writer rules; the [shared default Browser Profile Agent Note](../../.agents/notes/implemented/feature/2026-08-20-shared-default-browser-profile.md) records the omitted-profile default; the [Session Browser Workspace Agent Note](../../.agents/notes/implemented/feature/2026-08-19-session-browser-workspace.md) records Session-local ownership; the [browser control arbitration Agent Note](../../.agents/notes/implemented/feature/2026-08-19-browser-control-arbitration.md) records human and Agent ownership of one tab.

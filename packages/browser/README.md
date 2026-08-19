# browser/ — Browser Runtime capability family

English | [中文](README.zh.md)

This family defines provider-neutral browser control, a deterministic keyless Provider, a managed Tandem Browser HTTP Provider, a Session-owned Workspace binder, and deferred model-facing tools.

| Package | Role | ctx key |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition and opaque identity vocabulary | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | Deterministic temporary and named persistent Profile Provider | provides `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.md) | Managed Tandem Browser HTTP Provider for temporary and named persistent Profiles | provides `ctx.browserRuntime` |
| [`browser-workspace/`](browser-workspace/README.md) | Session-owned Browser Workspace binder | `ctx.browserWorkspace` |
| [`tool-browser/`](tool-browser/README.md) | Deferred model-facing Consumer | registers on `ctx.tools` |

The subsystem reference is [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md). The [temporary Browser Runtime Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md) records lifecycle and discovery; the [Tandem provider Agent Note](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.md) records the managed-subprocess design; the [Tandem macOS and Windows qualification Agent Note](../../.agents/notes/implemented/testing/2026-08-19-tandem-macos-windows-qualification.md) records the env-gated real-browser path; the [persistent Browser Profile Agent Note](../../.agents/notes/implemented/feature/2026-08-19-persistent-browser-profiles.md) records named-partition isolation and single-writer rules; the [Session Browser Workspace Agent Note](../../.agents/notes/implemented/feature/2026-08-19-session-browser-workspace.md) records Session-local ownership; the [browser control arbitration Agent Note](../../.agents/notes/implemented/feature/2026-08-19-browser-control-arbitration.md) records human and Agent ownership of one tab.

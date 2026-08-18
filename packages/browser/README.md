# browser/ — Browser Runtime capability family

English | [中文](README.zh.md)

This family defines provider-neutral browser control, a deterministic keyless Provider, a managed Tandem Browser HTTP Provider, and deferred model-facing tools.

| Package | Role | ctx key |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition and opaque identity vocabulary | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | Deterministic temporary-Profile Provider | provides `ctx.browserRuntime` |
| [`browser-runtime-tandem/`](browser-runtime-tandem/README.md) | Managed Tandem Browser HTTP Provider for one temporary Profile | provides `ctx.browserRuntime` |
| [`tool-browser/`](tool-browser/README.md) | Deferred model-facing Consumer | registers on `ctx.tools` |

The subsystem reference is [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md). The [temporary Browser Runtime Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md) records lifecycle, discovery, and persistence decisions; the [Tandem provider Agent Note](../../.agents/notes/implemented/feature/2026-08-18-tandem-browser-runtime-provider.md) records the managed-subprocess design and the unavailable/reconnect state model.

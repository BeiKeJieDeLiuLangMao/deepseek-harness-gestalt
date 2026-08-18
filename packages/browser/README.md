# browser/ — Browser Runtime capability family

English | [中文](README.zh.md)

This family defines provider-neutral browser control, a deterministic keyless Provider for one temporary Profile and tab, and deferred model-facing tools.

| Package | Role | ctx key |
|---|---|---|
| [`browser-runtime/`](browser-runtime/README.md) | Service Definition and opaque identity vocabulary | `ctx.browserRuntime` |
| [`browser-runtime-deterministic/`](browser-runtime-deterministic/README.md) | Deterministic temporary-Profile Provider | provides `ctx.browserRuntime` |
| [`tool-browser/`](tool-browser/README.md) | Deferred model-facing Consumer | registers on `ctx.tools` |

The subsystem reference is [docs/subsystems/browser-runtime.md](../../docs/subsystems/browser-runtime.md). The [temporary Browser Runtime Agent Note](../../.agents/notes/implemented/feature/2026-08-18-temporary-browser-runtime-tracer.md) records lifecycle, discovery, and persistence decisions.

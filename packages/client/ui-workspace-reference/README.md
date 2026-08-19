# `@deepseek-ai/dsh-client-ui-workspace-reference`

English | [中文](README.zh.md)

Web `@` source named `workspace`. Candidates come from the host workspace-reference index Remote and are ranked in the browser. A pick inserts plain-text `@rel/path` (directories keep a trailing slash). ArrowRight on a directory replaces the token with `@path/` and keeps the menu open. Pasted `@` tokens receive a word joiner while paste ignore is on. The composer dock lists referenced paths. Settings expose enable, paste ignore, and Exact/Regex basename filters. The host pre-step injects the existence-only marker. Decision record: the [Workspace Reference Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md).

## Model Experience

None, as this package is browser presentation only.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Index is one RPC per session** — keystroke ranking is local; workspace mutation is not watched until the next session scope or an explicit invalidate.
- **Paste ignore uses U+2060** after `@`; a hand-typed existing path still becomes a marker.

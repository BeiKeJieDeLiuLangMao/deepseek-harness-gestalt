# `@deepseek-ai/dsh-client-ui-workspace-reference`

English | [中文](README.zh.md)

Web `@` source named `workspace`. Candidates come from the host workspace-reference index Remote and are ranked in the browser. A pick inserts plain-text `@rel/path` (directories keep a trailing slash). The host pre-step injects the existence-only marker. Decision record: the [Workspace Reference Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md).

## Model Experience

None. The trigger pipeline is browser presentation. The model-visible marker is owned by `@deepseek-ai/dsh-workspace-reference`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Index is one RPC per session** — keystroke ranking is local; workspace mutation is not watched until the next session scope or an explicit invalidate.
- **Dock, paste ignore, folder descent, and settings filters** belong to the parity ticket, not this package's first landing.

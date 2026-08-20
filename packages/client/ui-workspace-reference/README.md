# `@deepseek-ai/dsh-client-ui-workspace-reference`

English | [中文](README.zh.md)

Web `@` source named `workspace`. Candidates come from the host workspace-reference index Remote and are ranked in the browser. A pick inserts a basename chip. Submit and clipboard expand it to `@rel/path` (directories keep a trailing slash). ArrowRight on a directory replaces the token with `@path/` and keeps the menu open. Pasted `@` tokens receive a word joiner while paste ignore is on. Settings expose enable, paste ignore, and Exact/Regex basename filters. The host pre-step injects the existence-only marker. Picker ranking includes portions derived from [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 0.6.3 (MIT); see [NOTICE](NOTICE). Decision record: the [Workspace Reference Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md).

## Configuration

| Key | Default | Contract |
|---|---:|---|
| `menuLimit` | `12` | Maximum ranked picker rows shown after `@`. |

## Model Experience

None, as this package is browser presentation only.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Index is one RPC per session** — keystroke ranking is local; workspace mutation is not watched until the next session scope or an explicit invalidate.
- **Paste ignore uses U+2060** after `@` in the composer draft. A hand-typed existing path still becomes a marker. Copied and sent user text keep that mark so Host scan still skips the token on submit and on replay. Stripping it from model-visible user text before send is not done: the mark must remain in the durable user message, otherwise replay would re-scan `@path` and inject a Workspace Reference, and a send-only strip would make the model-visible text differ from the session log.
- **A refresh restores the clipboard form** `@rel/path` in the draft. The basename chip is insert-time only.

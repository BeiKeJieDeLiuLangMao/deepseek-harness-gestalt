# `@deepseek-ai/dsh-workspace-reference`

English | [中文](README.zh.md)

Validates `@path` tokens in direct user messages and injects an existence-only Workspace Reference before the agent step. The plugin does not read file bytes or list directory children. Scan, ranking, and the built-in ignore list include portions derived from [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 0.6.3 (MIT); see [NOTICE](NOTICE). Decision record: the [Workspace Reference Agent Note](../../../.agents/notes/implemented/feature/2026-08-19-workspace-reference.md).

## Public API

- `scanMentions(text)` returns unique `@path` tokens. `@[label](dsh-session:…)` is not a path token. An `@` immediately after a word character is not a path token (`user@host.com`).
- `expandMentions(messages, cwd, fileSystem, signal)` confines each token with `path.resolve` / `path.relative`, rejects a realpath that leaves the workspace (including an intermediate-segment symlink), rejects a final-component symlink with `lstat`, and returns sourced `user/message` injections.
- `indexWorkspace(fileSystem, cwd, options, signal)` walks `listDir` one level at a time, skips ignore basenames and final-component symlinks, and omits a directory on `FS_PERMISSION_DENIED`.
- `rankFiles(files, query, limit)` ranks picker candidates: basename queries, ordered path-segment queries, and directories-first browse.
- `workspaceReference.search` is the picker Remote: it returns the raw index for the addressed session; the browser ranks per keystroke.

## Configuration

| Key | Default | Contract |
|---|---:|---|
| `maxIndexedFiles` | `5000` | Maximum picker index entries; the walk stops and reports truncation. |
| `ignoreDirs` | built-in VCS, IDE, dependency, and build names | Directory basenames skipped by the picker walk. Providing the key replaces the built-in list. |

## Model Experience

### Workspace path pointer

#### What the model sees

One sourced user-role message per validated path. The path is workspace-relative. `kind` is `file` or `directory`. The model inspects the path with the session's existing tools when the task requires contents.

##### Marker

```markdown
<workspace-reference path="docs/spec.pdf" kind="file" />
```

#### Token effect

Each reference adds one short marker. File bytes and directory listings are not added here.

#### KV Cache effect

Append-only. A new reference changes only the new suffix.

## Known Limitations and Deferred Work

- **Web scanner only in the first landing** — other hosts can mount the same plugin later; ACP and SDK text are not scanned until they do.
- **Picker index is advisory** — paths beyond `maxIndexedFiles` or inside ignored directories can still be referenced by a hand-typed `@path` that exists inside the workspace.
- **No gitignore** — only configured directory basenames and settings Exact/Regex filters apply.
- **Paste-marked tokens are skipped** — a `@` followed by U+2060 is not a Workspace Reference.
- **Email-like `@host` after whitespace** — `user@host.com` is not a path token, but a leading or space-prefixed `@host.com` still scans; injection still requires that basename to exist inside the workspace.
- **Windows drive-relative tokens** — `C:foo` is rejected on every platform, including as a POSIX filename.

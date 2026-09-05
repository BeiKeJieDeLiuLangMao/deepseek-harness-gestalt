---
description: "Host and Client workspace control: mutate workspace navigation and follow its complete projection."
kind: "package-reference"
---
# Workspace Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-workspace-controller` owns the Host `ctx.workspaceController` service and the generated Client `ctx.remote.workspace` namespace. Its Remote methods create, rename, remove, and reorder Workspaces, reorder Sessions within a Workspace, archive Sessions from Workspace navigation, read a Workspace checkout's Git `origin` without a shell, clone a Git remote into a new Workspace directory, and follow the complete Workspace projection. Use it through API Gateway when a Client must change or follow Workspace navigation. The package also owns `ctx.directoryPickerController` and the generated `ctx.remote.directoryPicker` namespace (`pick`, `list`, `createDirectory`), because the directory-picking seam it carries is abstract and never a Loader entry of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Host controller serializes mutations whose correctness depends on current registry state and throws `RemoteError` with a stable `workspace/*` or `directory-picker/*` code for expected failures. `gitRemote({ workspaceId }, signal)` resolves the registered Workspace, then runs `git remote get-url origin` through argv and the subprocess tree service: `-C` carries the Workspace path, the environment is allowlisted and non-interactive with `LC_ALL=C`, stdout/stderr are capped at 1 MiB, and abort terminates the process tree. Production Git fuses the caller signal with Host `gitTimeoutMs` (default 30s, at most `MAX_TIMER_DELAY_MS`); the Host deadline rejects with `workspace/git-failed` after `terminate` and `waitForExit`. A configured origin returns `{ remoteUrl }`. A directory Git reports as `not a git repository` under `LC_ALL=C`, or a checkout whose Git reports a missing `origin` (exit 2), returns `{}`. Other exit 128 results, including a nested or bare checkout with corrupt config, a missing Git executable, a Host deadline, a signal death, overflow, a missing subprocess service, or any other execution failure, reject with `workspace/git-failed`. Unknown Workspace ids reject with `workspace/not-found` without spawning Git. Caller abort rejects with `gateway/cancelled`. `cloneGit({ remoteUrl, parentPath, directoryName }, signal)` requires one path segment, exclusive `mkdir` of that child (an existing file, directory, or link is `workspace/clone-failed` and left in place), then `git clone -- <remoteUrl> <target>`. Allowed remotes are `https`, `ssh` (including scp-like), and `file`; `git://`, `http://`, `ext::`, and other helpers are refused before spawn. Production Git sets `GIT_ALLOW_PROTOCOL`, `GIT_CONFIG_NOSYSTEM`, and `GIT_CONFIG_GLOBAL` to an empty file outside the clone dest; user SSH keys via `HOME` remain available. Git or registry failure keeps the partial published directory and reports its path; the Host never recursively deletes that target, so the operator confirms cleanup or picks a new name. Same-UID rewrite of `parent` is not a promised bound; an observed symlink at parent or target is refused. Its `follow()` stream synchronously attaches to durable Workspace changes, emits one complete baseline first, then emits ordered `upsert`, `remove`, `order`, and `archived` increments. A reconnect starts another generation with a replacement baseline, so consumers do not depend on receiving every increment while disconnected.

The Client entry provides `ClientWorkspaceModel` and `createWorkspaceStateStream()`. The model owns Workspace rows, registry order, archived Session ids, unary mutation echoes, and stream/unary race resolution. A newer Host row wins by `updatedAt`; a committed stream order outranks an older unary response; a removed Workspace id cannot be resurrected by delayed data. The package exposes framework-neutral snapshots and subscriptions, leaving navigation policy and React hooks to the UI owner.

-----

<a id="model-experience"></a>
## Model Experience

None, as Workspace organization is browser and Host control state and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; Workspace mutations do not alter model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- `follow()` replaces the whole projection after reconnect and has no durable cursor or incremental catch-up protocol.
- Process-local deletion markers prevent delayed data from reviving a removed Workspace only for the lifetime of the Client model.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Workspace Registry owns persistence; every stream generation is a full projection.

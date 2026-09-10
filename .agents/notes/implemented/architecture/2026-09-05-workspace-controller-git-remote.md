# Agent Note: Workspace Controller reads Git origin without a shell

Status: implemented

English | [中文](2026-09-05-workspace-controller-git-remote.zh.md)

## Problem

Desktop Cloud Project create and membership recovery need the configured Git `origin` of a registered Workspace. That inspection lived on ApiProxy as `workspace.gitRemote`, which ran argv Git through the subprocess tree service. The Workspace Controller owns Host Workspace Remotes after the ApiProxy port and must expose origin inspection there.

## Decision

`WorkspaceController.gitRemote({ workspaceId }, signal)` is the Host Remote for origin inspection. It resolves the Workspace through `workspaceRegistry.get` and then runs `git -C <workspace.path> remote get-url origin` as argv, never a shell string. Production uses `createWorkspaceGitCommand` over `ctx.subprocess`: allowlisted environment, `LC_ALL=C`, non-interactive Git config, 1 MiB stdout/stderr capture, Host `gitTimeoutMs` (default 30s, at most `MAX_TIMER_DELAY_MS`) fused with the caller abort signal, and awaited process-tree exit. Tests may inject a `NativeCommandRunner`. A non-empty origin returns `{ remoteUrl }`. Git exit 2 for a missing `origin`, or exit 128 whose C-locale stderr contains `not a git repository`, returns `{}`. Other 128s fail closed, including a nested checkout or bare repository whose discovered config is corrupt. Classification does not use a Workspace-local `.git` path and does not parse localized stderr. A missing Git executable, a Host deadline, a signal death, overflow, a missing subprocess service, or any other execution failure rejects with `workspace/git-failed`. Unknown Workspace ids reject with `workspace/not-found` before Git runs. Caller abort, including `AbortSignal.timeout`, rejects with `gateway/cancelled`. `cloneGit({ remoteUrl, parentPath, directoryName }, signal)` exclusive-`mkdir`s one new child, clones with argv `git clone --`, and keeps a partial published directory on Git or registry failure. Allowed remotes are `https`, `ssh` (scp-like included), and `file`. Isolation config lives outside the clone dest. Same-UID rewrite of `parent` is not a promised bound. Project membership composition is the Client adapter in [the membership gateway Host Git note](2026-09-10-membership-gateway-host-workspace-git.md).

## Alternatives considered

**Keep origin reads on ApiProxy.** Rejected: #590 owns the port onto the Workspace Controller, and a leftover ApiProxy verb would keep a duplicated Host Git path.

**Treat every Git failure as `workspace/git-failed`.** Rejected: a local checkout without Git or origin is a valid Workspace; the invite UI needs an unbound remote, not a Host error.

**Treat every non-zero Git exit, including every 128, as unbound `{}`.** Rejected: missing Git, permission, corrupt config, and signal death are execution failures. Mapping them to `{}` hides Host Git breakage as an unbound Workspace.

**Treat every exit 128 as unbound when the Workspace has no `.git` path.** Rejected: nested checkouts and bare repositories have no Workspace-local `.git` and still exit 128 on corrupt config. Under `LC_ALL=C`, only the `not a git repository` diagnostic is unbound.

**Parse localized stderr for repository or remote absence.** Rejected: Git localizes those strings. Production Git sets `LC_ALL=C`; classification matches that C-locale `not a git repository` phrase only.

**Rely only on the caller `AbortSignal` for Git duration.** Rejected: a missing or never-aborting caller signal left production Git unbounded. Host `gitTimeoutMs` is the owned deadline; caller abort stays `gateway/cancelled`.

**Pass the Workspace path only as spawn `cwd`.** Rejected: argv `-C` keeps the inspected directory explicit and matches the retained ApiProxy Git argv.

**Recursively delete a published clone target on Git or registry failure.** Rejected: that path is user-visible after exclusive `mkdir`; cleanup is operator-confirmed. Isolation files stay outside the dest so Git still accepts an empty directory.

**Treat POSIX `rename` onto an empty directory as no-replace.** Rejected: Node `rename` replaces an empty dest. Occupancy is exclusive `mkdir` of the published name.

## Consequences

Clients can read origin through `ctx.remote.workspace.gitRemote` without trusting a client-supplied filesystem path. The membership gateway maps a Git-less `{}` origin to `local://workspace/<id>`. A failed clone leaves the exclusive child directory for the operator to delete or replace with a new name.

## Testing

- `packages/api/workspace-controller/tests/git-remote.host.spec.ts` covers a real checkout with origin, a Git checkout without origin, a non-Git Workspace, a corrupt config, a nested checkout whose parent config is corrupt, a bare repository whose `./config` is corrupt, an unreadable `.git`, missing Git (`ENOENT`), usage/unexpected exits, runner exceptions, signal death, an unknown id, argv `-C` shape, abort, `AbortSignal.timeout`, output overflow, a missing subprocess service, and production spawn argv with a 1 MiB capture.
- `packages/api/workspace-controller/tests/git-timeout.host.spec.ts` covers the production runner over `dsh-subprocess-local` with a tmp Git executable: Host deadline without caller abort, process-tree reap, a fast success that is not killed, and caller abort that is not classified as the Host timeout.
- `packages/api/workspace-controller/tests/clone-git.host.spec.ts` covers a local bare clone, occupied dest (dir/file/symlink), Git failure keeping a partial tree, abort keeping the directory, refused `git://`/`ext::`/`http://` before spawn, registry failure keeping the dest, and `GIT_ALLOW_PROTOCOL` plus an empty global config outside the dest.

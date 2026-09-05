# Agent Note: Workspace Controller reads Git origin without a shell

Status: implemented

English | [中文](2026-09-05-workspace-controller-git-remote.zh.md)

## Problem

Desktop Cloud Project create and membership recovery need the configured Git `origin` of a registered Workspace. That inspection lived on ApiProxy as `workspace.gitRemote`, which ran argv Git through the subprocess tree service. The Workspace Controller owns Host Workspace Remotes after the ApiProxy port, but it had no origin read, so Client membership still rejected `localRemoteFor`.

## Decision

`WorkspaceController.gitRemote({ workspaceId }, signal)` is the Host Remote for origin inspection. It resolves the Workspace through `workspaceRegistry.get` and then runs `git -C <workspace.path> remote get-url origin` as argv, never a shell string. Production uses `createWorkspaceGitCommand` over `ctx.subprocess`: allowlisted environment, `LC_ALL=C`, non-interactive Git config, 1 MiB stdout/stderr capture, caller abort, and awaited process-tree exit. Tests may inject a `NativeCommandRunner`. A non-empty origin returns `{ remoteUrl }`. A directory with no `.git` metadata, or Git exit 2 for a missing `origin`, returns `{}`. Classification uses Git exit codes and whether `.git` exists at the Workspace path; it does not parse localized stderr, and it does not treat every 128 as a non-repository. A present `.git` with exit 128, a missing Git executable, a signal death, overflow, a missing subprocess service, or any other execution failure rejects with `workspace/git-failed`. Unknown Workspace ids reject with `workspace/not-found` before Git runs. Caller abort, including `AbortSignal.timeout`, rejects with `gateway/cancelled`. Clone and Project membership wiring stay out of this operation.

## Alternatives considered

**Keep origin reads on ApiProxy.** Rejected: #590 owns the port onto the Workspace Controller, and a leftover ApiProxy verb would keep a duplicated Host Git path.

**Treat every Git failure as `workspace/git-failed`.** Rejected: a local checkout without Git or origin is a valid Workspace; the invite UI needs an unbound remote, not a Host error.

**Treat every non-zero Git exit, including every 128, as unbound `{}`.** Rejected: missing Git, permission, corrupt config, and signal death are execution failures. Mapping them to `{}` hides Host Git breakage as an unbound Workspace.

**Parse Chinese or English stderr for "not a git repository" / "No such remote".** Rejected: Git localizes those strings; exit 2 versus a `.git` path plus 128 is the stable distinction.

**Pass the Workspace path only as spawn `cwd`.** Rejected: argv `-C` keeps the inspected directory explicit and matches the retained ApiProxy Git argv.

## Consequences

Clients can read origin through `ctx.remote.workspace.gitRemote` without trusting a client-supplied filesystem path. Git-less Workspaces remain unbound until membership uses `local://workspace/<id>`. Clone is a later Workspace Controller operation.

## Testing

- `packages/api/workspace-controller/tests/git-remote.host.spec.ts` covers a real checkout with origin, a Git checkout without origin, a non-Git Workspace, a corrupt config, an unreadable `.git`, missing Git (`ENOENT`), usage/unexpected exits, runner exceptions, signal death, an unknown id, argv `-C` shape, abort, `AbortSignal.timeout`, output overflow, a missing subprocess service, and production spawn argv with a 1 MiB capture.

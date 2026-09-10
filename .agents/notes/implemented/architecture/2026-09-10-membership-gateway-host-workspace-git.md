# Agent Note: Membership gateway composes Host Workspace Git remotes

Status: implemented

English | [中文](2026-09-10-membership-gateway-host-workspace-git.zh.md)

## Problem

Workspace settings and the invite wizard call `ProjectMembershipGateway.createProject`, `projectForWorkspace`, `localRemoteFor`, and `cloneWorkspace`. Those methods rejected with a #590 Host Git gap even after `WorkspaceController` published `gitRemote` and `cloneGit`. Membership HTTP still speaks remote URLs, not Workspace ids, so the Client adapter had to compose origin lookup, clone parent pick, and project create/lookup itself.

## Decision

`membershipGatewayOf(clientOrRead, workspaceGit)` takes injected Host operations and never imports Context. Apply closes the second argument over `ctx.remote.workspace.gitRemote`, `cloneGit`, and `ctx.remote.directoryPicker.pick`. Each Host `RemoteResult` unwraps to `value` or throws `error.message`. `localRemoteFor` returns `remoteUrl` from `gitRemote({ workspaceId })`, or no value when the payload is `{}`. Create and project lookup use that origin, or `localWorkspaceRemoteUrl(workspaceId)` when Git reports none; lookup normalizes a present origin. `cloneWorkspace` asks for a parent directory, treats `null` as cancel without calling `cloneGit`, and otherwise registers the cloned Workspace. `decideInvitation` still forwards only `{ link }` on accept; `localWorkspaceId` is not a membership-client Host verb.

## Supersession check

[Workspace Controller Git origin](2026-09-05-workspace-controller-git-remote.md) still owns argv Git, `gitRemote`/`cloneGit` failure codes, and clone occupancy. This note owns only Client composition of those remotes onto `ProjectMembershipGateway`. The Controller note is a partial supersession and stays active.

## Alternatives considered

**Keep the #590 rejection until membership HTTP accepts Workspace ids.** Rejected: Host Git remotes already exist; the gap was Client composition, not a missing Controller verb.

**Import `ctx` inside the gateway.** Rejected: apply owns Remote wiring; the gateway stays a pure adapter so specs stub Host Git without a Context.

**Swallow Host Git failures as unbound.** Rejected: a timed-out or failed origin read is not a Git-less Workspace; the UI must see the Host message.

**Add `IWorkspaces.openPath` or pass `localWorkspaceId` through `decideInvitation`.** Rejected: clone already returns a registered Workspace, and membership HTTP still does not take a Host Workspace id as a decision verb.

## Consequences

Origin-present and Git-less Workspaces can create and recover Cloud Projects through the same gateway the settings UI already calls. Cancelling the parent-directory picker leaves the invitation pending. Host Git and picker failures surface as thrown messages.

## Testing

- `packages/client/ui-workspace/tests/membership-gateway.client.spec.ts` covers origin present, `local://workspace/<id>` when origin is absent, clone cancel, clone success mapping, and Host failure unwrap.
- `packages/client/ui-workspace/tests/apply.client.spec.ts` scripts `TestRemote` with `workspace.gitRemote` / `cloneGit` and asserts `localRemoteFor` invokes `gitRemote`.

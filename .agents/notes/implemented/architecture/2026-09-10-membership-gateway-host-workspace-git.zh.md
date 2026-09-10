# Agent Note: Membership gateway 组合 Host Workspace Git Remote

Status: implemented

[English](2026-09-10-membership-gateway-host-workspace-git.md) | 中文

## Problem

Workspace 设置与邀请向导调用 `ProjectMembershipGateway.createProject`、`projectForWorkspace`、`localRemoteFor` 和 `cloneWorkspace`。即使 `WorkspaceController` 已发布 `gitRemote` 与 `cloneGit`，这些方法仍以 #590 Host Git 缺口拒绝。Membership HTTP 仍使用 remote URL 而非 Workspace id，因此 Client adapter 必须自行组合 origin 读取、克隆父目录选择以及 project 创建/查找。

## Decision

`membershipGatewayOf(clientOrRead, workspaceGit)` 接收注入的 Host 操作，从不导入 Context。apply 把第二个参数闭包到 `ctx.remote.workspace.gitRemote`、`cloneGit` 和 `ctx.remote.directoryPicker.pick`。每个 Host `RemoteResult` 解开为 `value`，或抛出 `error.message`。`localRemoteFor` 返回 `gitRemote({ workspaceId })` 的 `remoteUrl`；载荷为 `{}` 时无值。创建与 project 查找使用该 origin；Git 未报告 origin 时使用 `localWorkspaceRemoteUrl(workspaceId)`；查找会规范化已有 origin。`cloneWorkspace` 询问父目录，`null` 视为取消且不调用 `cloneGit`，否则注册克隆出的 Workspace。`decideInvitation` 在接受时仍只转发 `{ link }`；`localWorkspaceId` 不是 membership-client 的 Host 动词。

## Supersession check

[Workspace Controller Git origin](2026-09-05-workspace-controller-git-remote.zh.md) 仍持有 argv Git、`gitRemote`/`cloneGit` 失败码以及克隆占用。本说明只持有这些 Remote 到 `ProjectMembershipGateway` 的 Client 组合。Controller 说明是部分取代，保持有效。

## Alternatives considered

**继续用 #590 拒绝，直到 membership HTTP 接受 Workspace id。** 拒绝：Host Git Remote 已经存在；缺口是 Client 组合，不是缺少 Controller 动词。

**在 gateway 内导入 `ctx`。** 拒绝：apply 持有 Remote 接线；gateway 保持纯 adapter，规格可在无 Context 时打桩 Host Git。

**把 Host Git 失败吞成未绑定。** 拒绝：超时或失败的 origin 读取不是无 Git Workspace；UI 必须看到 Host 消息。

**增加 `IWorkspaces.openPath`，或把 `localWorkspaceId` 传入 `decideInvitation`。** 拒绝：克隆已返回已注册 Workspace，且 membership HTTP 仍不把 Host Workspace id 作为决定动词。

## Consequences

有 origin 与无 Git 的 Workspace 都能通过设置 UI 已调用的同一 gateway 创建并恢复 Cloud Project。取消父目录选择会使邀请保持待确认。Host Git 与选择器失败以抛出的消息呈现。

## Testing

- `packages/client/ui-workspace/tests/membership-gateway.client.spec.ts` 覆盖有 origin、无 origin 时的 `local://workspace/<id>`、克隆取消、克隆成功映射，以及 Host 失败解开。
- `packages/client/ui-workspace/tests/apply.client.spec.ts` 用带 `workspace.gitRemote` / `cloneGit` 的 `TestRemote` 断言 `localRemoteFor` 会调用 `gitRemote`。

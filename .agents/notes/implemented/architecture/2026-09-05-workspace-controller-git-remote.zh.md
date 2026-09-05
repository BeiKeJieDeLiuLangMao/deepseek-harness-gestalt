# Agent Note: Workspace Controller 无 shell 读取 Git origin

Status: implemented

[English](2026-09-05-workspace-controller-git-remote.md) | 中文

## Problem

Desktop 的 Cloud Project 创建与 membership 恢复需要已注册 Workspace 上配置的 Git `origin`。该检查原先在 ApiProxy 的 `workspace.gitRemote`，通过 subprocess tree 服务以 argv 运行 Git。ApiProxy 迁出后 Workspace Controller 拥有 Host Workspace Remote，但没有 origin 读取，因此 Client membership 仍会拒绝 `localRemoteFor`。

## Decision

`WorkspaceController.gitRemote({ workspaceId }, signal)` 是 origin 检查的 Host Remote。它通过 `workspaceRegistry.get` 解析 Workspace，再以 argv 运行 `git -C <workspace.path> remote get-url origin`，从不拼 shell 字符串。生产路径使用 `createWorkspaceGitCommand` 调用 `ctx.subprocess`：白名单环境、非交互 Git 配置、1 MiB stdout/stderr 捕获、调用方 abort，并等待进程树退出。测试可注入 `NativeCommandRunner`。非空 origin 返回 `{ remoteUrl }`。非 Git 目录、没有 origin 的 checkout，或其他非零 Git 退出返回 `{}`。未知 Workspace id 在运行 Git 之前以 `workspace/not-found` 拒绝。捕获溢出或缺少 subprocess 服务以 `workspace/git-failed` 拒绝。调用方 abort（含 `AbortSignal.timeout`）以 `gateway/cancelled` 拒绝。Clone 与 Project membership 接线不在本操作内。

## Alternatives considered

**把 origin 读取留在 ApiProxy。** 拒绝：#590 要求迁到 Workspace Controller，留下 ApiProxy 动词会重复 Host Git 路径。

**把每次 Git 失败都当成 `workspace/git-failed`。** 拒绝：没有 Git 或 origin 的本地 checkout 仍是有效 Workspace；邀请 UI 需要未绑定 remote，而不是 Host 错误。

**只把 Workspace 路径作为 spawn `cwd`。** 拒绝：argv `-C` 让被检查目录保持显式，并与保留的 ApiProxy Git argv 一致。

## Consequences

Client 可通过 `ctx.remote.workspace.gitRemote` 读取 origin，而不信任客户端提供的文件系统路径。无 Git 的 Workspace 在 membership 使用 `local://workspace/<id>` 之前保持未绑定。Clone 是后续 Workspace Controller 操作。

## Testing

- `packages/api/workspace-controller/tests/git-remote.host.spec.ts` 覆盖带 origin 的真实 checkout、没有 origin 的 Git checkout、非 Git Workspace、未知 id、argv `-C` 形态、非零退出、abort、`AbortSignal.timeout`、输出溢出、缺少 subprocess 服务，以及生产 spawn argv 与 1 MiB 捕获。

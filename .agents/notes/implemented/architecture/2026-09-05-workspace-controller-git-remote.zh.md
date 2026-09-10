# Agent Note: Workspace Controller 无 shell 读取 Git origin

Status: implemented

[English](2026-09-05-workspace-controller-git-remote.md) | 中文

## Problem

Desktop 的 Cloud Project 创建与 membership 恢复需要已注册 Workspace 上配置的 Git `origin`。该检查原先在 ApiProxy 的 `workspace.gitRemote`，通过 subprocess tree 服务以 argv 运行 Git。ApiProxy 迁出后 Workspace Controller 拥有 Host Workspace Remote，必须在该处提供 origin 检查。

## Decision

`WorkspaceController.gitRemote({ workspaceId }, signal)` 是 origin 检查的 Host Remote。它通过 `workspaceRegistry.get` 解析 Workspace，再以 argv 运行 `git -C <workspace.path> remote get-url origin`，从不拼 shell 字符串。生产路径使用 `createWorkspaceGitCommand` 调用 `ctx.subprocess`：白名单环境、`LC_ALL=C`、非交互 Git 配置、1 MiB stdout/stderr 捕获、Host `gitTimeoutMs`（默认 30s，不超过 `MAX_TIMER_DELAY_MS`）与调用方 abort signal 融合，并等待进程树退出。测试可注入 `NativeCommandRunner`。非空 origin 返回 `{ remoteUrl }`。缺少 `origin` 的 exit 2，或 exit 128 且 C-locale stderr 含 `not a git repository`，返回 `{}`。其他 128 失败关闭，包括 nested checkout 或 bare repository 发现到损坏配置。分类不使用 Workspace 本地 `.git` 路径，也不解析本地化 stderr。缺少 Git 可执行文件、Host deadline、信号终止、输出溢出、缺少 subprocess 服务，或其他执行失败都以 `workspace/git-failed` 拒绝。未知 Workspace id 在运行 Git 之前以 `workspace/not-found` 拒绝。调用方 abort（含 `AbortSignal.timeout`）以 `gateway/cancelled` 拒绝。`cloneGit({ remoteUrl, parentPath, directoryName }, signal)` 对一个新子目录独占 `mkdir`，以 argv `git clone --` 克隆，Git 或 registry 失败时保留已公布的部分目录。允许的 remote 是 `https`、`ssh`（含 scp-like）和 `file`。隔离配置放在 clone 目的地之外。不承诺防御同 UID 改写 `parent`。Project membership 组合位于 Client adapter，见 [membership gateway Host Git 说明](2026-09-10-membership-gateway-host-workspace-git.zh.md)。

## Alternatives considered

**把 origin 读取留在 ApiProxy。** 拒绝：#590 要求迁到 Workspace Controller，留下 ApiProxy 动词会重复 Host Git 路径。

**把每次 Git 失败都当成 `workspace/git-failed`。** 拒绝：没有 Git 或 origin 的本地 checkout 仍是有效 Workspace；邀请 UI 需要未绑定 remote，而不是 Host 错误。

**把每次非零 Git 退出（含每次 128）都当成未绑定 `{}`。** 拒绝：缺少 Git、权限失败、损坏配置和信号终止是执行失败。把它们映射成 `{}` 会把 Host Git 故障藏成未绑定 Workspace。

**在 Workspace 没有 `.git` 路径时把每次 exit 128 都当成未绑定。** 拒绝：nested checkout 与 bare repository 没有 Workspace 本地 `.git`，配置损坏时仍会 exit 128。在 `LC_ALL=C` 下，只有 `not a git repository` 诊断是未绑定。

**解析本地化 stderr 以判断仓库或 remote 缺失。** 拒绝：Git 会本地化这些字符串。生产 Git 设置 `LC_ALL=C`；分类只匹配该 C-locale 的 `not a git repository` 短语。

**只靠调用方 `AbortSignal` 限制 Git 时长。** 拒绝：缺少或不触发 abort 的调用方 signal 会让生产 Git 无界等待。Host `gitTimeoutMs` 是所属 deadline；调用方 abort 仍是 `gateway/cancelled`。

**只把 Workspace 路径作为 spawn `cwd`。** 拒绝：argv `-C` 让被检查目录保持显式，并与保留的 ApiProxy Git argv 一致。

**Git 或 registry 失败时递归删除已公布的 clone target。** 拒绝：独占 `mkdir` 之后该路径对用户可见；清理由操作者确认。隔离文件放在 dest 之外，以便 Git 仍接受空目录。

**把 POSIX `rename` 覆盖空目录当成 no-replace。** 拒绝：Node `rename` 会替换空 dest。占用检测是对已公布名字的独占 `mkdir`。

## Consequences

Client 可通过 `ctx.remote.workspace.gitRemote` 读取 origin，而不信任客户端提供的文件系统路径。membership gateway 把 Git-less 的 `{}` origin 映射为 `local://workspace/<id>`。失败的 clone 会留下独占子目录，由操作者删除或另选名字。

## Testing

- `packages/api/workspace-controller/tests/git-remote.host.spec.ts` 覆盖带 origin 的真实 checkout、没有 origin 的 Git checkout、非 Git Workspace、损坏配置、父配置损坏的 nested checkout、`./config` 损坏的 bare repository、不可读 `.git`、缺少 Git（`ENOENT`）、usage/意外退出、runner 异常、信号终止、未知 id、argv `-C` 形态、abort、`AbortSignal.timeout`、输出溢出、缺少 subprocess 服务，以及生产 spawn argv 与 1 MiB 捕获。
- `packages/api/workspace-controller/tests/git-timeout.host.spec.ts` 覆盖生产 runner 在 `dsh-subprocess-local` 上配合临时 Git 可执行文件：无调用方 abort 的 Host deadline、进程树回收、快速成功不被误杀，以及调用方 abort 不被分类为 Host timeout。
- `packages/api/workspace-controller/tests/clone-git.host.spec.ts` 覆盖本地 bare clone、已占用 dest（目录/文件/symlink）、Git 失败保留部分树、abort 保留目录、spawn 前拒绝 `git://`/`ext::`/`http://`、registry 失败保留 dest，以及 dest 之外的 `GIT_ALLOW_PROTOCOL` 与空 global config。

# Agent Note: 显式配置 PR 策略读取认证

Status: implemented

[English](2026-08-17-explicit-pull-request-policy-read-authentication.md) | 中文

## 问题

PR 策略会读取 PR 元数据、被请求 reviewer、review、被引用 Issue，并可选读取 Issue field 值。GitHub 允许相关 PR review 端点不经认证读取公开资源，但认证请求可能因 token 不具备所需 Pull requests 权限而失败。把该失败视为 PR 不存在或改用匿名请求重试，都会掩盖部署与授权错误。

PR 策略读取、Issue Priority 集成与 Project 生命周期自动化具有不同的可用性和授权要求。一项能力的认证方式不能安全地决定另外两项能力的认证方式。

## 决策

`.github/issue-management/config.json` 要求 `pullRequestReadAuthentication` 严格取值为 `anonymous` 或 `token`。个人公开 tracker 选择 `anonymous`。`pr` 命令会把该选择传给所有读取 PR 或被引用 Issue 数据的 REST 请求。即使环境中存在 token，匿名模式也不会发送 `Authorization`。token 模式会把 `GH_TOKEN` 或 `GITHUB_TOKEN` 作为 Bearer token 发送；两项变量都未设置时，会在首次 API 请求前失败。非法配置会在启动时失败。

两种模式下的 API 错误都是致命错误。策略绝不会在认证请求失败后匿名重试，也不会把 `404` 转换为元数据缺失。

通用 API 客户端默认继续使用 token 认证。生命周期、Project GraphQL 与审计读写操作不使用 `pullRequestReadAuthentication`；它们要求生命周期工作流提供的 GitHub App token。[Issue Priority field 决策](2026-08-17-explicit-issue-priority-field-deployment.md)与[仓库相对生命周期决策](2026-08-17-repository-relative-issue-policy.md)分别负责这些独立的部署选项。

## 验证

Issue management 测试通过本地 fake GitHub API 执行真实的 `policy.mjs pr` 与 `policy.mjs lifecycle` 命令。测试检查每个请求头，验证缺少 token 与非法配置在零请求时失败，保留两种模式的 `404` 失败，并执行一次使用 token 认证的生命周期 mutation。

## 考虑过的替代方案

**存储 personal access token secret。** 否决，因为公开策略读取不需要个人凭据，而 PAT 会扩大 secret 所有权与轮换义务。

**要求或扩大 GitHub App 的 Pull requests 权限。** 否决，因为仓库配置无法验证已安装 App 的权限集合，而公开只读资源具有明确的未认证 API 路径。

**遇到 `404` 时改用未认证请求重试。** 否决，因为相同响应可能表示私有仓库、缺少权限、仓库错误或资源不存在。认证降级会使配置错误变成含义不清的行为。

**让通用 API 客户端使用匿名模式。** 否决，因为生命周期与审计操作会读取受保护的 Project 状态，并写入仓库或 Project 数据。匿名访问仅限 `pr` 命令的公开读取路径。

## 后果

个人公开 tracker 的 PR 策略读取不再依赖无法验证的 token 权限。私有或需认证的部署保留 Bearer 认证，并在缺少凭据时于网络访问前失败。匿名模式接受 GitHub 的未认证速率限制，且不能用于生命周期或审计操作。

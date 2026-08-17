# Agent Note: 显式配置 PR 策略读取认证与激活

Status: implemented

[English](2026-08-17-explicit-pull-request-policy-read-authentication.md) | 中文

## 问题

PR 策略会读取 PR 元数据、被引用 Issue，并可选读取 Issue field 值。被请求 reviewer 与 review 只提供原策略用来进入强制范围的信号，并不参与元数据校验。部分个人账户公开仓库无法通过匿名请求解析这些 review 端点，但使用仓库范围 token 可以成功读取。仅为决定何时开始强制执行而要求这些端点，会使有效的工作流 token 仍无法执行策略。

PR 策略读取、Issue Priority 集成与 Project 生命周期自动化具有不同的可用性和授权要求。一项能力的认证方式不能安全地决定另外两项能力的认证方式。

## 决策

`.github/issue-management/config.json` 要求 `pullRequestReadAuthentication` 严格取值为 `anonymous` 或 `token`。`pr` 命令会把该选择传给所有读取 PR 或被引用 Issue 数据的 REST 请求。即使环境中存在 token，匿名模式也不会发送 `Authorization`。token 模式会把 `GH_TOKEN` 或 `GITHUB_TOKEN` 作为 Bearer token 发送；两项变量都未设置时，会在首次 API 请求前失败。

同一配置要求 `pullRequestPolicyActivation` 严格取值为 `non-draft` 或 `review-activity`。`non-draft` 会对作者既不是 Bot 也不是 App 的每个非 Draft PR 应用元数据策略；其快照绝不会请求被请求 reviewer 或 review。`review-activity` 保留在出现 review request 或 review 后激活的行为，并读取这两个端点。非法值或空白值会在启动时失败。

个人 tracker 选择 `token` 与 `non-draft`。其普通 PR 与被引用 Issue 读取使用工作流 token，策略执行不依赖 review 端点。

每种认证与激活组合下的 API 错误都是致命错误。策略绝不会在认证请求失败后匿名重试，也不会把 `404` 转换为元数据缺失。

通用 API 客户端默认继续使用 token 认证。生命周期、Project GraphQL 与审计读写操作不使用 `pullRequestReadAuthentication`；它们要求生命周期工作流提供的 GitHub App token。[Issue Priority field 决策](2026-08-17-explicit-issue-priority-field-deployment.md)与[仓库相对生命周期决策](2026-08-17-repository-relative-issue-policy.md)分别负责这些独立的部署选项。

## 验证

Issue management 测试通过本地 fake GitHub API 执行真实的 `policy.mjs pr` 与 `policy.mjs lifecycle` 命令。测试检查两种激活模式的确切请求列表与请求头，证明 review 端点不可用时 `non-draft` 仍能成功，验证缺少 token 与非法配置在零请求时失败，保留 API 失败，并执行一次使用 token 认证的生命周期 mutation。

## 考虑过的替代方案

**个人 tracker 保留匿名读取。** 否决，因为即使仓库与 PR 公开，review 端点的匿名请求仍可能无法解析 PR node。

**存储 personal access token secret。** 否决，因为工作流 token 已能读取所需的普通 PR 与 Issue 资源，而 PAT 会扩大 secret 所有权与轮换义务。

**要求或扩大 GitHub App 的 Pull requests 权限。** 否决，因为生命周期授权与只读 PR 策略相互独立，而且仓库配置无法验证已安装 App 的权限集合。

**遇到 `404` 时改用未认证请求重试。** 否决，因为相同响应可能表示私有仓库、缺少权限、仓库错误或资源不存在。认证降级会使配置错误变成含义不清的行为。

**个人 tracker 继续用 review activity 作为激活信号。** 否决，因为 review 数量不校验元数据，读取它们只会增加授权依赖，不会增强策略结果。

## 后果

个人 tracker 从首个非 Draft 人类 PR 事件起使用工作流 token 强制执行元数据策略，且不读取 review 端点。选择 `review-activity` 的部署保留 review 驱动时机及其端点要求。匿名模式仅限已经验证所有所需端点均支持该模式的部署用于 `pr` 读取；生命周期与审计操作始终要求 token。

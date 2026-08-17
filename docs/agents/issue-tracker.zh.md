# Issue tracker：GitHub

[English](issue-tracker.md) | 中文

DeepSeek Gestalt 产品规格和 ticket 存放在 `BeiKeJieDeLiuLangMao/deepseek-harness-gestalt` 的 GitHub Issues 中。所有操作都使用 `gh` CLI（命令行界面）并指定 `--repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt`。`deepseek-ai/deepseek-harness` 上游仓库不承载 Gestalt 产品 tracker。

## 操作

- 创建：`gh issue create --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --title "..." --body "..."`
- 读取：`gh issue view <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --comments`
- 列出：`gh issue list --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --state open`
- 评论：`gh issue comment <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --body "..."`
- 添加或移除标签：使用 `gh issue edit <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt`
- 关闭：`gh issue close <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --comment "..."`

GitHub Issues 和 PR（Pull Request）共享同一编号空间。遇到含义不明的编号时，先用 `gh pr view` 解析，失败后再用 `gh issue view`。

## 工作流部署

Issue 策略从工作流提供的 `GITHUB_REPOSITORY` 解析仓库；仓库 owner 和名称不是部署配置。

PR 策略的读取认证是 `.github/issue-management/config.json` 中的一项显式部署选项。仅公开仓库可将 `pullRequestReadAuthentication` 设为 `anonymous`：即使环境中存在工作流 token，`pr` 命令的所有 PR 与被引用 Issue 读取也不会发送 `Authorization`，而任何 API 错误仍是致命错误。需要认证的仓库应将其设为 `token`：命令会把 `GH_TOKEN` 或 `GITHUB_TOKEN` 作为 Bearer token 发送；两者都不存在时，命令会在首次请求前失败。其他值会在启动时被拒绝。GitHub 说明公开资源的[被请求 reviewer](https://docs.github.com/en/rest/pulls/review-requests#get-all-requested-reviewers-for-a-pull-request)与 [PR review](https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request)读取均可不经认证。个人账户 tracker 使用 `anonymous`。

Issue Priority 同步是 `.github/issue-management/config.json` 中的一项显式部署选项。仅当仓库支持对应字段时，才把 `priorityField` 设为组织 Issue field 的名称；策略随后读取每个被引用 Issue 的字段值，并在 API 出错时失败。设为 `null` 会关闭该集成：策略不会发出 Issue field 请求，并把被引用 Issue 视为未设置 Priority。个人账户 tracker 使用 `null`，因为 GitHub Issue fields 不适用于用户账户拥有的仓库。

组织 Project 生命周期投影是一项显式部署选项。仅当仓库 owner 与 `.github/issue-management/config.json` 中的 `projectOrganization` 一致、该配置指定了目标组织 Project，并且仓库为具备所需仓库与组织权限的已安装 GitHub App 提供 `DSH_ISSUE_APP_CLIENT_ID` 和 `DSH_ISSUE_APP_PRIVATE_KEY` 时，才将仓库变量 `DSH_ISSUE_PROJECT_LIFECYCLE_ENABLED` 设为 `true`。工作流会在请求 installation token 前验证两者使用同一 owner。该变量缺失或不等于 `true` 时，生命周期 job 会在此验证前跳过。生命周期与审计请求始终要求 App token；`pullRequestReadAuthentication` 绝不会使这些读写请求变为匿名。个人账号 tracker 保持禁用此选项，因为 installation token 不会授予用户 ProjectV2 的访问权。

## 将 PR 作为 triage 入口

**将 PR 作为请求入口：否。**

PR 实现或关联 ticket；它们不会作为新的产品请求进入 Matt triage 队列。

## Skill 操作

当 skill（技能）要求「发布到 issue tracker」时，在 Gestalt 仓库中创建 GitHub Issue。当 skill 要求「获取相关 ticket」时，读取 Issue 正文、标签和评论。

`to-tickets` 先发布 blocker，再发布依赖项。GitHub sub-issue 和原生 Issue 依赖可用时，使用这些关系；否则，在依赖项 Issue 正文中写入 `Part of #<parent>` 和 `Blocked by: #<number>`。

每次实现都必须从对应 ticket 开始，保留其中的验收条件，并在 commit 或 PR 中引用该 Issue。关闭前，在 ticket 中更新验证证据。

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

## 将 PR 作为 triage 入口

**将 PR 作为请求入口：否。**

PR 实现或关联 ticket；它们不会作为新的产品请求进入 Matt triage 队列。

## Skill 操作

当 skill（技能）要求「发布到 issue tracker」时，在 Gestalt 仓库中创建 GitHub Issue。当 skill 要求「获取相关 ticket」时，读取 Issue 正文、标签和评论。

`to-tickets` 先发布 blocker，再发布依赖项。GitHub sub-issue 和原生 Issue 依赖可用时，使用这些关系；否则，在依赖项 Issue 正文中写入 `Part of #<parent>` 和 `Blocked by: #<number>`。

每次实现都必须从对应 ticket 开始，保留其中的验收条件，并在 commit 或 PR 中引用该 Issue。关闭前，在 ticket 中更新验证证据。

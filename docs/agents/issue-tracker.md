# Issue tracker: GitHub

English | [中文](issue-tracker.zh.md)

DeepSeek Gestalt product specs and tickets live in GitHub Issues on `BeiKeJieDeLiuLangMao/deepseek-harness-gestalt`. Use the `gh` CLI with `--repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt` for every operation. The `deepseek-ai/deepseek-harness` upstream repository is not the Gestalt product tracker.

## Operations

- Create: `gh issue create --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --title "..." --body "..."`
- Read: `gh issue view <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --comments`
- List: `gh issue list --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --state open`
- Comment: `gh issue comment <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --body "..."`
- Apply or remove labels: use `gh issue edit <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt`
- Close: `gh issue close <number> --repo BeiKeJieDeLiuLangMao/deepseek-harness-gestalt --comment "..."`

GitHub shares one number space across issues and pull requests. Resolve an ambiguous number with `gh pr view` and fall back to `gh issue view`.

## Workflow deployment

Issue policy resolves its repository from the workflow-provided `GITHUB_REPOSITORY`; repository owner and name are not deployment configuration.

Organization Project lifecycle projection is an explicit deployment option. Set the repository variable `DSH_ISSUE_PROJECT_LIFECYCLE_ENABLED` to `true` only when the repository owner matches `projectOrganization` in `.github/issue-management/config.json`, that configuration names the target organization Project, and the repository provides `DSH_ISSUE_APP_CLIENT_ID` and `DSH_ISSUE_APP_PRIVATE_KEY` for an installed GitHub App with the required repository and organization permissions. The workflow validates the shared owner before requesting an installation token. When the variable is absent or not `true`, the lifecycle job skips before that validation. Personal-account trackers leave this option disabled because an installation token does not grant access to a user's ProjectV2.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Pull requests implement or relate to tickets; they do not enter the Matt triage queue as new product requests.

## Skill operations

When a skill says “publish to the issue tracker,” create a GitHub issue in the Gestalt repository. When it says “fetch the relevant ticket,” read the issue body, labels, and comments.

`to-tickets` publishes blockers before dependents. Use GitHub sub-issues and native issue dependencies when available. Otherwise, put `Part of #<parent>` and `Blocked by: #<number>` in the dependent issue body.

Each implementation must start from its ticket, preserve its acceptance criteria, and reference the issue from its commit or pull request. Update the ticket with verification evidence before closing it.

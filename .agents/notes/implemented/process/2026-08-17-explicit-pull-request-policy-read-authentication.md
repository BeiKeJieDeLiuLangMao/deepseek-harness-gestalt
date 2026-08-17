# Agent Note: Explicit pull-request policy read authentication and activation

Status: implemented

English | [中文](2026-08-17-explicit-pull-request-policy-read-authentication.zh.md)

## Problem

Pull-request policy reads pull-request metadata, referenced Issues, and optionally Issue field values. Review requests and reviews supply only the signal that the original policy used to enter enforcement; they do not participate in metadata validation. Some public personal-account repositories do not resolve those review endpoints anonymously even though a repository-scoped token reads them successfully. Requiring the endpoints merely to decide when enforcement begins makes a valid workflow token insufficient for policy execution.

Pull-request policy reads, Issue Priority integration, and Project lifecycle automation have different availability and authorization requirements. Authentication for one cannot safely imply authentication for the others.

## Decision

`.github/issue-management/config.json` declares `pullRequestReadAuthentication` as the exact value `anonymous` or `token`. The `pr` command passes that choice to every REST read of pull-request or referenced-Issue data. Anonymous mode omits `Authorization` even when a token is present in the environment. Token mode sends `GH_TOKEN` or `GITHUB_TOKEN` as a Bearer token and fails before the first API request when neither variable is set.

The same configuration declares `pullRequestPolicyActivation` as `non-draft` or `review-activity`. `non-draft` applies metadata policy to every non-Draft PR whose author is neither a Bot nor an App; its snapshot never requests requested reviewers or reviews. `review-activity` retains activation after a review request or review and reads both endpoints. Invalid or blank values fail at startup.

The personal tracker selects `token` and `non-draft`. Its ordinary PR and referenced-Issue reads use the workflow token, and policy applies without depending on review endpoints.

API errors remain fatal for every authentication and activation combination. The policy never retries a failed authenticated request anonymously and never converts `404` into absent metadata.

The generic API client remains token-authenticated by default. Lifecycle, Project GraphQL, and audit read or write operations do not consume `pullRequestReadAuthentication`; they require the GitHub App token supplied by the lifecycle workflow. The [Issue Priority field decision](2026-08-17-explicit-issue-priority-field-deployment.md) and [repository-relative lifecycle decision](2026-08-17-repository-relative-issue-policy.md) own those independent deployment choices.

## Verification

Issue-management tests execute the real `policy.mjs pr` and `policy.mjs lifecycle` commands against a local fake GitHub API. They inspect exact request lists and headers for both activation modes, prove that `non-draft` succeeds when review endpoints are unavailable, verify zero-request failures for missing tokens and invalid configuration, preserve API failures, and exercise a token-authenticated lifecycle mutation.

## Alternatives considered

**Keep anonymous reads for the personal tracker.** Rejected because the review endpoints can fail to resolve the PR node anonymously even when the repository and PR are public.

**Store a personal access token secret.** Rejected because the workflow token already reads the required ordinary PR and Issue resources, while a PAT would expand secret ownership and rotation obligations.

**Require or expand GitHub App Pull requests permission.** Rejected because lifecycle authorization is independent of read-only pull-request policy and repository configuration cannot verify the installed App permission set.

**Retry `404` without authentication.** Rejected because the same response can identify a private repository, missing permission, wrong repository, or nonexistent resource. Authentication fallback would turn configuration failures into ambiguous behavior.

**Keep review activity as the personal tracker activation signal.** Rejected because review counts do not validate metadata, and reading them adds an authorization dependency without strengthening policy results.

## Consequences

The personal tracker enforces metadata from the first non-Draft human PR event using its workflow token and no review endpoint. Deployments that select `review-activity` retain the review-driven timing and its endpoint requirements. Anonymous mode remains confined to `pr` reads in deployments that verify every required endpoint supports it; lifecycle and audit operations always require a token.

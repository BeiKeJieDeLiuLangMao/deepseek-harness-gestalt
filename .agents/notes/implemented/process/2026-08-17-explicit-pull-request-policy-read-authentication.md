# Agent Note: Explicit pull-request policy read authentication

Status: implemented

English | [中文](2026-08-17-explicit-pull-request-policy-read-authentication.zh.md)

## Problem

Pull-request policy reads pull-request metadata, review requests, reviews, referenced Issues, and optionally Issue field values. GitHub allows the relevant pull-request review endpoints to read public resources without authentication, but an authenticated request can fail when its token does not have the required Pull requests permission. Treating that failure as a missing pull request or retrying anonymously would hide deployment and authorization errors.

Pull-request policy reads, Issue Priority integration, and Project lifecycle automation have different availability and authorization requirements. Authentication for one cannot safely imply authentication for the others.

## Decision

`.github/issue-management/config.json` declares `pullRequestReadAuthentication` as the exact value `anonymous` or `token`. The personal public tracker selects `anonymous`. The `pr` command passes that choice to every REST read of pull-request or referenced-Issue data. Anonymous mode omits `Authorization` even when a token is present in the environment. Token mode sends `GH_TOKEN` or `GITHUB_TOKEN` as a Bearer token and fails before the first API request when neither variable is set. Invalid configuration fails at startup.

API errors remain fatal in both modes. The policy never retries a failed authenticated request anonymously and never converts `404` into absent metadata.

The generic API client remains token-authenticated by default. Lifecycle, Project GraphQL, and audit read or write operations do not consume `pullRequestReadAuthentication`; they require the GitHub App token supplied by the lifecycle workflow. The [Issue Priority field decision](2026-08-17-explicit-issue-priority-field-deployment.md) and [repository-relative lifecycle decision](2026-08-17-repository-relative-issue-policy.md) own those independent deployment choices.

## Verification

Issue-management tests execute the real `policy.mjs pr` and `policy.mjs lifecycle` commands against a local fake GitHub API. They inspect every request header, verify zero-request failures for missing token and invalid configuration, preserve `404` failures in both modes, and exercise a token-authenticated lifecycle mutation.

## Alternatives considered

**Store a personal access token secret.** Rejected because public policy reads do not require a personal credential, and a PAT would expand secret ownership and rotation obligations.

**Require or expand GitHub App Pull requests permission.** Rejected because repository configuration cannot verify the installed App permission set, while public read-only resources have an explicit unauthenticated API path.

**Retry `404` without authentication.** Rejected because the same response can identify a private repository, missing permission, wrong repository, or nonexistent resource. Authentication fallback would turn configuration failures into ambiguous behavior.

**Make the generic API client anonymous.** Rejected because lifecycle and audit operations read protected Project state and write repository or Project data. Anonymous access is confined to the `pr` command's public read path.

## Consequences

The public personal tracker no longer depends on unverifiable token permissions for PR policy reads. Private or authenticated deployments retain Bearer authentication and fail before network access when credentials are absent. Anonymous mode accepts GitHub's unauthenticated rate limits and cannot be used for lifecycle or audit operations.

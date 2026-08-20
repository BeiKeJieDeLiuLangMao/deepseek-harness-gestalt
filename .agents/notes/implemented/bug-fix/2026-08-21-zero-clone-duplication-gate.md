# Agent Note: Restore the zero-clone duplication gate

Status: implemented

English | [中文](2026-08-21-zero-clone-duplication-gate.zh.md)

## Problem

`pnpm run duplication` stayed green only while the five ticketed product clones hid behind `jscpd:ignore` comments: Desktop Account/pairing bind, Jobs/Schedule list Escape handling, the two Platform HTTP JSON/error paths, and the two script snapshot runners. Raising `minTokens`/`minLines` or adding those files to `.jscpd.json` `ignore` would have made the gate lie about product code.

## Decision

Shared logic is extracted only where ownership and dependency direction stay valid. `@deepseek-ai/dsh-host-webserver` owns parameterized `readJsonObject`, `writeJson`, `writeHttpError`, `writeRetryAfterError`, and `HttpError`. Platform Account HTTP and Remote Access HTTP pass their own status, code, and message; domain mapping (`AccountError` vs `RemoteAccessError`, 401/400 vs 409) stays in each Consumer. Desktop Account and pairing bind through `bindDesktopSnapshot` in `ui-desktop`'s snapshot source. Jobs/Schedule Escape handlers and the two script snapshot runners no longer meet the gate threshold once the ignore comments are removed, so they lose those comments without a new shared module. `.jscpd.json` keeps `minTokens: 60`, `minLines: 6`, and `**/tests/**` ignored. Deliberate parallel implementations (bash/pwsh, package invariants, Trajectory Definitions) keep their existing source-range exceptions.

This note supersedes the HTTP `jscpd:ignore` sentence in the [inherited baseline CI reds note](2026-08-19-inherited-ci-baseline-reds.md).

## Alternatives considered

**Keep `jscpd:ignore` on the HTTP readers because each Consumer owns status-line copy.** Rejected: the gate would still exclude the ticketed product code. Parameterized helpers keep the copy at the call site.

**Put the helpers in a new `platform-http` package.** Rejected: both Consumers already depend on `dsh-host-webserver`, and the helpers are generic HTTP JSON I/O with caller-supplied codes, not a Platform capability.

**Put the helpers on `platform-account`.** Rejected: Remote Access HTTP would import Account service-definition for HTTP plumbing, reversing ownership.

**Extract a Jobs/Schedule Escape hook into `ui-primitives` or a snapshot-runner helper in `scripts/`.** Rejected: after the ignore comments are gone those pairs stay under the current threshold, and a client plugin must not import another plugin's values.

**Raise `minTokens`/`minLines` or ignore the product paths.** Rejected: that is the acceptance failure the ticket names.

## Consequences

The duplication gate reports zero clones on `packages` and `scripts` without excluding the ticketed product files. A new Platform HTTP Consumer can reuse the webserver helpers and must still supply its own codes and copy. Desktop bind races stay in one function; Account and pairing only name their Host methods.

## Verification

`pnpm run duplication` reports zero clones. Focused owning tests cover `http-json.ts`, Platform Account HTTP envelopes, Remote Access HTTP assembled routes, and Desktop Account/pairing bind. Removing the ticketed `jscpd:ignore` comments and re-running the gate still reports zero clones.

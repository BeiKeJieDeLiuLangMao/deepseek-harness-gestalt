# Agent Note: Required CI failures run their owning local gates before another push

Status: implemented

English | [中文](2026-09-11-required-ci-owning-local-gates.zh.md)

## Problem

A specification merge can spend several required CI rounds on catalog freshness, live snapshot pins, and website dead links while pre-push only typechecks. The delivery skill tells writers to use [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md), but a coordinating session that implements because no writer is available can treat CI annotations as the test runner.

## Decision

[dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) maps required GitHub checks to owning local gates. `node 24 / static` runs `doc-sync` (or `docs:build:mpa` plus the catalog verifiers). `node 24 / snapshots and artifacts` runs `test:snapshot -t <scenario>` and refreshes class-pinned headers through `DSH_SNAPSHOT=refresh`. Those gates must pass before another push for the same failure. [Delivery orchestration](../../../skills/orchestrate-dsh-delivery/SKILL.md) applies the same table when the coordinating session is the unique writer. [testing.md](../../../../docs/testing.md) forbids hand-edited live pins. Adding `packages/*/tool-*`, changing public `ToolRuntime` methods, or changing catalog link targets runs the matching `verify-*-catalog` before commit.

## Alternatives considered

**Keep CI as the first exhaustive catalog and snapshot runner.** Rejected: fail-fast static and snapshot jobs expose one stale pin per push.

**Widen the pre-push hook to `doc-sync` plus snapshots.** Rejected: every commit would pay the repository-wide documentation and snapshot matrix that CI already owns.

## Consequences

A unique-writer coordinator still does not become the default implementer. When it does implement a required CI failure, it runs the owning local gate instead of pushing the next annotation-shaped pin.

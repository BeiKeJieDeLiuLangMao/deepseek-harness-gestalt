# Agent Note: required CI 失败必须先跑其所属本地门禁，再另一次 push

Status: implemented

[English](2026-09-11-required-ci-owning-local-gates.md) | 中文

## Problem

规格合入可能在 catalog 新鲜度、live snapshot pin 和网站死链上消耗多轮 required CI，而 pre-push 只做 typecheck。交付技能要求 writer 使用 [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md)，但在没有 writer 时由协调会话实现时，可以把 CI annotation 当成测试运行器。

## Decision

[dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) 把 required GitHub check 映射到所属本地门禁。`node 24 / static` 跑 `doc-sync`（或 `docs:build:mpa` 加 catalog verifier）。`node 24 / snapshots and artifacts` 跑 `test:snapshot -t <scenario>`，class pin 的 header 通过 `DSH_SNAPSHOT=refresh` 写回。同一失败再次 push 前，这些门禁必须绿色。[Delivery orchestration](../../../skills/orchestrate-dsh-delivery/SKILL.md) 在协调会话作为 unique writer 时使用同一张表。[testing.md](../../../../docs/testing.zh.md) 禁止手改 live pin。新增 `packages/*/tool-*`、改公开 `ToolRuntime` 方法或改 catalog 链接目标时，提交前跑对应的 `verify-*-catalog`。

## Alternatives considered

**继续把 CI 当作第一套穷尽 catalog 与 snapshot 运行器。** 否决：fail-fast 的 static 和 snapshot job 每次 push 只暴露一个过期 pin。

**把 pre-push hook 扩成 `doc-sync` 加 snapshots。** 否决：每次 commit 都会支付 CI 已经拥有的全库文档和 snapshot 矩阵。

## Consequences

unique-writer 协调者仍然不是默认实现者。当它确实实现 required CI 失败时，它跑所属本地门禁，而不是按 annotation 形状再推一个 pin。

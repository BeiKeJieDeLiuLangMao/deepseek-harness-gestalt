# Agent Note: Windows coverage 测不到 workflow worker-thread 源文件

Status: implemented

[English](2026-08-20-windows-worker-thread-coverage.md) | 中文

## Problem

原生 Windows coverage 清单会跑 `packages/workflow/workflow-worker-thread/tests/session.spec.ts`，测试通过。同一 job 随后在 `src/index.ts` 与 `src/host.ts` 上达不到 per-file 100%（行约 83/84%，分支约 75/65%）。Linux 对同一批源文件是 100%。缺口是 Windows 的 v8 coverage 不会把 `worker_threads` 里的执行记回这两个文件。票级 PR 就算只修了其它包的 Linux 覆盖率，仍会在这条 Windows 清单上变红。

## Decision

**只在 `win32` 上排除这两个由 worker 承担的源文件。** `vitest.config.ts` 把 `packages/workflow/workflow-worker-thread/src/index.ts` 与 `src/host.ts` 加进既有的 Windows coverage 排除列表，与 confinement runner 入口并列。Linux coverage 仍负责 100% 门槛。session 套件仍留在 Windows 测试清单里。

## Verification

`session.spec.ts` 仍在 `processBoundTests` 中，且没有被加入 `windowsUnsupportedTests`。Windows 排除列表点名原生清单在测试通过后失败的那两个文件。Linux coverage 配置不变。

## Alternatives considered

**重跑 Windows job，指望 coverage 碰巧挂上。** 否决：#155、#170、#158 都在测试通过后倒在同一对文件上。重试改变不了插桩。

**在 Windows 上排除整个 `workflow-worker-thread` 包。** 否决：只有 `index.ts` 与 `host.ts` 达不到门槛；失败 job 上该包其余文件已经 100%。

**降低 Windows 的 per-file 门槛。** 否决：那会藏掉其它 Windows 覆盖率回归。

## Consequences

原生 Windows 不再因为票级 PR 并不拥有的插桩缺口而失败。Linux 仍会拒绝 worker-thread 包的覆盖率下降。

# Agent Note: 等待 Windows 依赖 fixture 的有界清理

Status: implemented

[English](2026-09-08-windows-dependency-fixture-cleanup.md) | 中文

## Problem

依赖准备门禁可能在 pnpm 子进程返回后删除自有 fixture 时失败。[Issue #630](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/630) 记录了同一源码树上的两次 Windows `rmSync` EPERM 失败。真实 Windows Node 24.19.0 探针持有一个不共享删除权限的普通 fixture 文件 700 毫秒：当前清理尽管配置了重试，仍在 0–1 毫秒内失败，而相同参数的异步删除在 1031–1032 毫秒内成功。两种观察均重复成立。首个真实策略场景的六次隔离执行通过；CI 的具体文件占用者或权限来源仍未确定。

## Decision

最终 fixture 删除使用 Node 异步 `rm`，保留现有 `recursive: true`、`force: true`、`maxRetries: 10` 和 `retryDelay: 100`。门禁通过 `removeFixtureRoot`、`finishFixture`、`useFixture`、每个场景和 `main` 逐层等待清理，保持场景顺序。移除符号链接与 junction 时不遍历其目标。最终清理失败仍须报错；场景与清理都失败时保留两个原始错误。场景异常终止时，已经收集的策略违规与原始异常一并保留，且不会启动下一 fixture。

[依赖准备策略](../process/2026-09-05-dependency-preparation-policy.zh.md) 继续拥有准备、拒绝与覆盖语义，清理机制保留该策略及其 fixture 组合。

## Alternatives considered

**增加同步重试次数。** 受控 Windows 探针表明，已经配置十次重试仍会立即失败。增加一个在观察到的失败中未生效的数值，不能证明清理完成。

**忽略最终 EPERM。** 门禁成功会留下自有状态，并掩盖未解决的生命周期失败。清理必须完成或报告错误。

## Verification

Windows 回归使用真实子进程持有的普通文件：短时占用在原有预算内释放后，删除完成；持续占用则拒绝。测试等待占用者退出并验证最终清理。可移植测试覆盖等待删除、主要失败后仍等待清理、最终拒绝、双错误保留、悬空链接和外部目标保留。完整离线策略 fixture 执行全部拒绝、恢复和覆盖场景。

## Consequences

每个调用方都必须等待清理 promise，然后才能启动下一 fixture 或退出。受控占用证明清理弱点，并不证明尚未确定的 CI 占用者。重复策略失败必须保持可诊断，不能被清理掩盖。等待清理完成会增加 fixture 之间的等待，但不削弱断言或延长重试预算。

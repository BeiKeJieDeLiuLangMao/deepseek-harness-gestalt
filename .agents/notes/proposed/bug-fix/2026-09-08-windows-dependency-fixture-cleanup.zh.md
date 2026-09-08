# Agent Note: 等待 Windows 依赖 fixture 的有界清理

Status: proposed

[English](2026-09-08-windows-dependency-fixture-cleanup.md) | 中文

## Problem

依赖准备门禁可能在 pnpm 子进程返回后删除自有 fixture 时失败。[Issue #630](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/630) 记录了同一源码树上的两次 Windows `rmSync` EPERM 失败。真实 Windows Node 24.19.0 探针持有一个不共享删除权限的普通 fixture 文件 700 毫秒：当前清理尽管配置了重试，仍在 0–1 毫秒内失败，而相同参数的异步删除在 1031–1032 毫秒内成功。两种观察均重复成立。首个真实策略场景的六次隔离执行通过；CI 的具体文件占用者或权限来源仍未确定。

## Proposal

最终 fixture 删除使用 Node 异步 `rm`，保留现有 `recursive: true`、`force: true`、`maxRetries: 10` 和 `retryDelay: 100`。通过 `removeFixtureRoot`、`finishFixture`、`useFixture`、每个场景和 `main` 逐层等待清理，保持场景顺序。移除符号链接与 junction 时不遍历其目标。最终清理失败仍须报错；场景与清理都失败时保留两个原始错误。保留现有数组中收集的策略违规。

[依赖准备策略](../../implemented/process/2026-09-05-dependency-preparation-policy.zh.md) 继续拥有准备、拒绝与覆盖语义，本提案不取代该决策。实现仅限 fixture 脚本、所属测试、受影响的依赖准备文档和本 Note，不改变依赖、工作流门禁、超时、包导入或链接模式、产品行为或发布版本。

## Alternatives considered

**增加同步重试次数。** 受控 Windows 探针表明，已经配置十次重试仍会立即失败。增加一个在观察到的失败中未生效的数值，不能证明清理完成。

**忽略最终 EPERM。** 门禁成功会留下自有状态，并掩盖未解决的生命周期失败。清理必须完成或报告错误。

## Acceptance criteria

Windows 回归使用真实子进程持有的普通文件：既有 helper 失败，修复后的 helper 等待释放并在原有预算内删除目录。持续占用仍须拒绝；测试等待占用者退出并验证最终清理。可移植测试覆盖等待成功、主要失败后仍等待清理、最终拒绝、双错误保留、悬空链接和外部目标保留。完整离线策略 fixture 在 Windows Node 24.19.0、pnpm 11.7.0 及受支持的本地主机上通过。运行所属定向测试、文档门禁、lint、空白检查和正常推送类型检查；原生 Windows 静态可移植性 CI 提供完整结论。

## Risks

每个调用方都必须等待清理 promise，然后才能启动下一 fixture 或退出。受控占用证明清理弱点，并不证明尚未确定的 CI 占用者。重复策略失败必须保持可诊断，不能被清理掩盖。此独立 CI 修复先落地，再重新验证 #629；它不提供 Mobile 或 Desktop 发布证据，也不需要产品 GUI、模型调用或 GIF。

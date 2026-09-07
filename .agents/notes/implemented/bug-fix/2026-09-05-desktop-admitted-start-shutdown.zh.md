# Agent Note: Desktop 已接纳启动的关闭所有权

Status: implemented

[English](2026-09-05-desktop-admitted-start-shutdown.md) | 中文

## Problem

Web Host 的 spawn promise 不涵盖生成子进程前的 Browser 和 Membership 初始化、就绪结果交接，以及等待退役的旧 Host。关闭可能漏掉已接纳操作随后创建的资源。在 spawn adapter 内检查取消信号，不能为这些前后区间建立所有权。

## Decision

Desktop 通过 [DesktopHostLifecycle](../../../../apps/desktop/src/host-lifecycle.ts) 执行启动、替换与关闭。启动准入在 creator 执行前发布，并发请求加入同一操作。owner 在检查取消前持有返回的 runtime 和 Host 句柄。关闭在 abort 回调前发布记忆化任务，等待已接纳启动，停止精确持有的当前及退役 Host，并在其他清理失败时仍释放 runtime。启动从不等待关闭。spawn adapter 将就绪前停止失败作为 `WebHostStartupCleanupError` 拒绝；它是 `AggregateError`，具有字面量 kind `startup-cleanup-failed`、原始 `startupError`、未修改的 `cleanupError`，`errors` 同时包含两者，`cause` 为启动错误；即使没有返回 Host 句柄或启动已经落定，owner 仍保留该类型化失败。普通启动拒绝不会自动视为清理失败。关闭在所有其他清理尝试后汇总保留的失败，不声称子进程已退出。拒绝返回的 initializer 清理未交付的部分资源；owner 在初始化失败时回滚新取得的 runtime，并保留释放失败结果。

普通 Host 重试和替换保留 runtime 单例。初次重试、一次 respawn 决策、超时、Companion 安装和导航仍由调用方负责。调用方在 await 后发布就绪前检查当前所有权与准入关闭状态。[DesktopShutdown](../../../../apps/desktop/src/shutdown.ts) 保留首次请求的模式和退出码，观察独立清理失败，并仅在全部落定后显式退出；清理失败使用退出码 1。清理全部落定后会捕获诊断输出异常，避免其阻止退出。即使清理失败，请求 promise 也在策略处理结束后 resolve；调用方不能将 resolve 当作成功关闭或子进程退出的确认。

[直接子进程退出来源决策](2026-09-05-web-host-exit-provenance.zh.md)仍独立适用：停止失败不代表子进程已退出。原生 allow-quit/重复 quit 行为和 Host 准入前的早期启动操作不在此保证内。不引入进程发现、后代进程隔离、helper IPC 或新重试策略。

## Alternatives considered

**只在 spawn 前检查取消。** 迟到 runtime 创建与替换退役仍不受关闭所有权覆盖。

**取消的启动等待关闭。** 关闭已等待接纳的启动；反向等待会死锁。

**使用通用 pending-task broker。** 所需状态就是 Desktop runtime 单例与精确 Host 句柄；Desktop 本地 owner 使资源交接与测试直接对应生产操作。

## Consequences

[Owner 测试](../../../../apps/desktop/tests/host-lifecycle.spec.ts)通过可控 fake adapter 覆盖 browser/membership 就绪、取消、就绪交接、退役 Host 退出、initializer 拒绝、同步重入与清理失败。[关闭测试](../../../../apps/desktop/tests/shutdown.spec.ts)无需 Electron 即覆盖首次请求和独立失败语义。这些测试不证明真实 Desktop 关闭、原生 quit 等待或进程树隔离。不改变模型转录或 SDK 事件；真实 headless 验收仍是独立测试层。

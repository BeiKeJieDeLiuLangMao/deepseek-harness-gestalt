# Agent Note: 预构建隐藏手机验收

[English](2026-09-05-prebuilt-hidden-phone-acceptance.md) | 中文

Status: proposed

## Problem

仅点击的播放检查需要已构建的 Desktop 组合，但不能重建共享产物或运行无关的 Agent、设备场景。子进程的 `close` 等待可能被继承的管道阻塞，清理失败后删除 scratch 则会销毁所有权证据。

## Proposal

使用一个仅测试的预构建包装器，要求根会话审核已发布 SHA 的输入图与启动时不足 60 秒的受保护进程清单，复用隐藏 E2E profile、现有手机 helpers，并显式启用暂缓发送的合成 H264 流。输入图把每个组件 identity 绑定到规范文件 realpath 与 hash，并绑定实际 Node、WDIO、Electron、Desktop main、operated Platform 配置、helpers、fixture 及完整 Host/Client/Web 闭包。包装器在启动前和退出后复核输入图。完整输入图是外部 build owner 前置，源码不伪造它。

在就绪前持久化直接启动器所有权，将 `exit` 观察与管道 `close` 分离，并记忆化有界完成。只有正常零退出，且 smoke log 同时包含唯一就绪 Host、该 Host 的 `requestedStop=stop` 精确退出与 success-only `shutdown complete` 收据、模型请求为零、Host/fake/CDP 监听器全部关闭时才成功。生产 owner 在发布收据前等待 Host 与 fake 子进程句柄。恢复保留 scratch，且只能向捕获的直接启动器发送 TERM；发现条件永不授予信号权限。不引入 fixture IPC 或进程 broker。

子进程仅接收显式 keyless 环境、新的空 `HOME`、`DSH_HOME` 与 `TMPDIR`、固定 fake 可执行文件、拒绝设备工具的 PATH 前缀及拒绝请求的 loopback 模型 provider。只用元数据拒绝凭据 fallback 路径而不读取内容；不复制用户设置或凭据。

[Desktop Electron 场景](../../implemented/testing/2026-08-31-desktop-phone-electron-e2e-lane.zh.md)保留更广的场景与构建决策。[Host 世代所有权策略](../../implemented/testing/2026-09-05-bounded-host-generation-fixture-ownership.zh.md)保留原生所有权约束。两者均未被替代：此包装器只是有界优雅退出测试支持，不是生产 broker，也不保证原生 Host-SIGKILL 包含性。

## Alternatives considered

**原有运行器。** 无条件构建与无关场景不符合一次预构建、仅点击的验收任务。

**无限等待直接子进程 close。** 后代进程可能在启动器退出后仍持有 stdout，使清理无法开始。

**清理失败仍删除 scratch。** 已拥有的进程或监听器可能仍存活，删除会销毁证据。

## Acceptance criteria

假子进程检查覆盖零/非零退出、继承管道占用、verifier 失败、直接启动器恢复、未知 observer 隔离与一次成功完成。纯校验拒绝变化的组件 identity、realpath 逃逸、过期 inventory、凭据 fallback、不匹配的 Host 退出与缺失收据。字节 fixture 验证 H264 暂缓发送与释放、结束控制。任何 Desktop 执行都先经根会话审核完整输入图。实际路线要求等待状态、当前 canvas 的非均匀像素、可见解码回退、替换后的等待与重绘、graceful shutdown 证据与监听器关闭。

## Risks

组件输入图证明已审核的列出输入，但 build owner 审核仍必须证明其中 Host/Client/Web 列表完整。同用户文件系统访问、网络隔离、绝对设备命令、过期 decoder 回调、失败的 MJPEG、物理硬件与原生崩溃包含性需要独立证据。本提案不携带完整输入图或实际 Desktop 结果。[场景参考](../../../../apps/desktop/tests/e2e-electron/README.zh.md)负责执行前置条件与限制。

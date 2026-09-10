# Agent Note: 隔离内置 CLIProxyAPI 运行时与 provider 权限

Status: proposed

[English](2026-09-09-built-in-cliproxyapi-runtime-slice.md) | 中文

## Problem

Desktop 需要拥有一个随包提供的 CLIProxyAPI 进程，同时不得读取或控制现有 CLIProxyAPI 安装。该进程必须从可核验的内置可执行文件启动，让 management 与 inference 权限远离 renderer 代码，只发布本地核心实际提供的模型，并在关闭时达到静止状态。

## Proposal

Desktop 打包从 `catalog/cliproxyapi` gitlink 构建的原生 CLIProxyAPI 可执行文件。生成的 manifest 记录源码 SHA、Node 平台与架构、相对可执行文件名和 SHA-256。正式包启动会拒绝缺失、目标不符或被修改的资源，且不会下载替代文件或搜索 `PATH`。开发环境仅在提供显式 fixture 可执行文件时启动该组件。

每个 Desktop 实例在自己的 `userData` 下生成一个私有运行代，并以该运行代作为 core cwd 启动，因此自动 dotenv 加载无法触及仓库或用户工作区的 `.env`。子进程接收明确的操作系统环境白名单，而不是 ambient storage、provider 或 credential 配置。该目录包含配置、auth 目录、日志、management key 与 inference key。配置仅绑定 IPv4 loopback 上由 Host 选择的临时端口，禁用 management control panel，且不引用 Sub2API 或用户的 CLIProxyAPI home。

每个运行代会在其私有目录写入自签 localhost 证书，并以 HTTPS 启动核心。监督器在访问 `/v1/models` 时钉住该证书，仅在 TLS 握手成功、取消仍未发生且子进程仍存活后才写入 inference Authorization。没有该运行代证书的竞争 HTTP 监听者无法完成握手，也收不到 key。Management 与 inference key 始终分离。只有 HTTPS inference 端点、inference key 和运行代证书路径以 `NODE_EXTRA_CA_CERTS` 进入 Web Host 子进程环境；renderer 协议、settings、诊断与模型元数据均不接收这些值。

Web Host 插件拥有稳定 route `gestalt-account-pool`。空目录或不可用目录不注册 route；活跃模型列表变化时，它通过原子操作发布或撤回 route，并让 LLM registry 拒绝冲突。Dispose 会先中止并等待进行中的目录读取，再移除注册。

每个恢复后的 core 运行代都会把新端点与 inference key 发布给 Host；Host 随后替换 Web Host，因此 provider 无法继续保留上一运行代的权限。关闭会请求终止精确的已 spawn 进程组，在有界宽限期后升级为强制终止，并等待退出。账号池首次启动失败保持为局部不可用，不会阻止 Desktop 其余部分启动。

Host 在 spawn 前预留一个临时 loopback 端口，因为当前 pin 虽然会把 `port: 0` 交给 `net.Listen`，配置对象仍保留零，management 代码无法重建自身 URL。预留关闭后再 spawn 存在有界分配竞争；若其他监听者抢占端口，启动会失败，但不会终止或复用该进程。

## Alternatives considered

**使用固定产品端口。** 未采用，因为并发隔离 Desktop 实例和无关服务会冲突，而且产品不得停止现有监听者。

**直接使用 `port: 0`。** 未采用，因为此 pin 的监听器虽获得动态端口，核心配置仍记录零，management callback URL 无法确定监听地址。

**复用用户的 `cliproxyapi` provider id。** 未采用，因为内置产品权限不得替换用户配置的 route。专用 id 也使 registry 冲突检查能够明确失败。

## Acceptance criteria

- 打包可执行文件与 manifest 的源码 SHA、平台、架构、路径和 SHA-256 一致；开发环境必须提供显式 fixture 路径。
- 配置、auth 文件、日志、management key 和 inference key 始终位于 Desktop 实例的私有 state root 下；子进程 cwd 与环境白名单会阻止外部 `.env`、storage 配置、CLIProxyAPI 或 Sub2API 状态进入启动过程。
- Capability 发布前必须同时完成运行代证书钉住与带认证的 HTTPS readiness；恢复会替换 Host capability 与 Web Host 运行代；关闭会取消恢复，对精确进程组执行有界优雅终止与强制终止、移除生成状态，并保持无关监听者不变。
- `gestalt-account-pool` 仅在实时模型目录非空时出现，通过 LLM 通知机制更新，在失败或空结果时撤回，拒绝冲突，并在 dispose 后消失。
- macOS arm64 从 pin 的 submodule 原生构建并通过真实监督器完成无密钥运行；macOS x64 与 Windows x64 的原生发布 runner 在打包前构建各自目标二进制。

## Risks

Spawn 前预留并释放动态端口无法让分配对无关进程保持原子性。冲突会被视为明确启动失败，而不是接管监听者。

当前模型端点提供标识符，但不提供完整能力元数据。在核心响应提供经验证的丰富信息前，provider 仅发布保守的文本模型目录项。

本 slice 不暴露账号登录、OAuth callback、额度观测或 renderer 控件。这些 consumer 需要独立 Host 操作与验收证据。

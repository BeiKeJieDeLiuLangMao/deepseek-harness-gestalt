# 跨运行时 Noise 安全证明

[English](noise-cross-runtime-proof.md) | 中文

本文档是 [Gestalt Issue 28](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/28) 在 [Mobile Companion Spec 27](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/27) 下的可复现安全评审入口。它记录有界证明与实现选择，不会向产品添加 Mobile Companion 传输层。

## 决策与范围

选择的实现是 [Snow 0.10.0](https://github.com/mcginty/snow/tree/v0.10.0)：从 Rust 一次编译为 WebAssembly，并由 Node、`WKWebView` 与 Android `WebView` 原样使用。`Cargo.lock` 固定 Snow 及其传递依赖。适配层只配置 Snow、驱动握手与传输消息并判定结果；它不实现 Noise token、X25519、ChaChaPoly、SHA-256，也不创建新线协议。这遵循仓库的既有决策：当维护中的依赖能够删除自有的安全敏感代码时，优先使用该依赖。

证明只允许首次配对使用 `Noise_XKpsk3_25519_ChaChaPoly_SHA256`，重连使用 `Noise_IK_25519_ChaChaPoly_SHA256`。两者都使用 `dsh-mobile-companion-v1` prologue。协议名、握手角色、PSK 位置、最大消息大小与降级允许列表都是已评审适配层中的常量。

只有独立安全评审者记录下述评审结论后，这项决策才具备进入产品集成的条件。集成仍需另行实现中继分帧、挑战状态、会话生命周期、原生密钥存储与发布门禁。

## 证据清单

提交的证明位于 [scripts/noise-security-path/src/lib.rs](../../scripts/noise-security-path/src/lib.rs)。无密钥可运行快照 [noise-security-path.snapshot.ts](../../scripts/noise-security-path.snapshot.ts) 也会执行其稳定报告。

| 证据 | 检查内容 |
|---|---|
| 官方向量 | 针对两个固定协议名，将准确的握手密文、传输密文、载荷与握手哈希同 Noise v34 Cacophony 向量比较。 |
| 目标流程 | XKpsk3 配对与 IK 重连双向完成，认证预期远端静态密钥，并交换双向传输载荷。 |
| 新鲜临时密钥 | 两次独立生成的配对握手与两次独立生成的重连握手，各自给出不同的首个临时公钥。 |
| 主动攻击 | 修改密文、重放握手消息、重放传输消息、乱序传输消息、配对时使用不同 Desktop 静态身份，以及使用允许列表之外的协议名都会被拒绝。 |
| 资源上限 | 携带 65,519 字节载荷的 65,535 字节 Noise 消息可往返，连续十六个 65,536 字节消息均被拒绝。尝试次数固定，使证明自身保持有界。 |
| 运行时一致性 | 同一份已提交 WASM 模块与 JavaScript 加载器在 Node 22、Node 24、iOS Simulator `WKWebView` 和 Android Emulator `WebView` 中生成相同报告。原生宿主只加载资源并返回 JSON 结果。 |

向量子集提交于 [official-noise-v34.json](../../scripts/noise-security-path/vectors/official-noise-v34.json)。其元数据通过 SHA-256 固定 [Snow 0.10.0 中的 Cacophony 向量副本](https://github.com/mcginty/snow/blob/v0.10.0/tests/vectors/cacophony.txt)。Noise 项目将 Cacophony 记为官方向量生成器，并在其[测试向量指南](https://github.com/noiseprotocol/noise_wiki/wiki/Test-vectors)中定义向量格式。65,535 字节消息上限来自 [Noise Protocol Framework](https://noiseprotocol.org/noise.html#message-format)。

## 密钥存储声明

证明刻意区分静态存储与密码运算：

- 产品集成可以在原生操作系统提供相应能力时，使用其硬件支持设施封装静态私钥材料。
- 所选路径中的 X25519 运算在 Snow WebAssembly 进程内存中执行。本证明不声称 Secure Enclave、StrongBox、KeyMint、硬件 X25519 或不可提取性。
- 模拟器通过只能证明 WebView 兼容性，不能证明物理设备硬件密钥保护。原生存储与清零需要各自的实现及评审证据。

## 复现评审

使用干净的 macOS checkout，并准备 Rust、`wasm32-unknown-unknown` target、`wasm-bindgen-cli` 0.2.127、pnpm、带可用 iPhone Simulator 的 Xcode，以及包含 platform 34、Build Tools 35.0.0 和名为 `GestaltTest` 的 arm64 AVD 的 Android SDK。Node 矩阵默认使用 Homebrew 的 Node 22 与 24 路径；其他安装方式可设置 `DSH_NOISE_NODE22_BIN` 和 `DSH_NOISE_NODE24_BIN`。Android 路径可通过 `ANDROID_SDK_ROOT`、`DSH_NOISE_ANDROID_API`、`DSH_NOISE_ANDROID_BUILD_TOOLS` 与 `DSH_NOISE_ANDROID_AVD` 选择。

运行：

```sh
pnpm run proof:noise:build
git diff --exit-code -- scripts/noise-security-path/pkg
cargo test --locked --manifest-path scripts/noise-security-path/Cargo.toml
pnpm run proof:noise:node-matrix
pnpm run proof:noise:ios
pnpm run proof:noise:android
pnpm exec vitest run --config vitest.snapshot.config.ts scripts/noise-security-path.snapshot.ts
```

构建命令必须在不产生 diff 的情况下复现已提交的 JavaScript 与 WASM。每条运行时命令都必须返回 `allPass: true`、两个准确协议名、值均为 `true` 的攻击结果，以及相同资源上限。iOS 与 Android runner 会构建一次性原生宿主、启动真实平台 WebView、校验运行时标签，然后移除证明应用。它们不会用 Node 结果替代。

独立评审者在批准产品集成前还应检查下列事项：

1. 确认 `Cargo.toml`、`Cargo.lock` 与 `THIRD_PARTY_NOTICES.txt` 从预期 registry 来源解析 Snow 0.10.0，并确认上游版本和仓库维护状态仍可接受。
2. 将已提交向量子集与固定的 Cacophony 来源比较，包括密文与握手哈希，而不是相信证明的成功标签。
3. 确认 Rust 适配层使用 Snow 的公开 builder 与状态机 API，且不包含复制的 Noise 原语或修改后的 Snow 源码。
4. 检查每个负向用例是否因预期原因失败，并确认协议允许列表不存在协商回退。
5. 重新运行全部五种环境，并在评审记录中保留准确的工具、操作系统、模拟器、仿真器与 WebView 版本。
6. 确认存储措辞没有暗示硬件支持的 X25519 执行或模拟器保护。

使用下列最小格式在 pull request 上记录独立结论：

```text
Independent Noise security review: PASS | FAIL
Reviewer and affiliation:
Reviewed commit:
Tool and runtime versions:
Vector provenance verified: yes | no
Attack and resource cases reproduced: yes | no
Thin-adapter and dependency-source audit: pass | fail
Storage-claim wording accepted: yes | no
Findings and required follow-ups:
```

在该记录出现且所有发现均已解决之前，本证明只是实现选择的证据，不是发布 Mobile Companion 安全路径的授权。

## 已知限制

本证明不测试中继认证、中继分帧、凭证刷新、重连调度、设备撤销、QR 挑战过期、持久 nonce 存储、操作系统后台行为，也不测试单条 Noise 消息之外的拒绝服务控制。它也不证明 WebView 引擎的常数时间行为、原生密钥清零、物理设备硬件行为、固定依赖清单之外的供应链策略，或 Snow 之外实现的互操作性。这些仍是明确的评审与集成工作，不是本原型的隐含声明。

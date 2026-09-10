# Agent Note：CLIProxyAPI 额度观测库是第一方纯库

Status: implemented

[English](2026-09-10-cliproxy-quota-observation-library.md) | 中文

## Problem

[内置账号池提案](../../proposed/architecture/2026-09-09-built-in-cliproxyapi-account-pool.zh.md)要求对五家账号厂商做归一化额度观测，同时不向渲染端暴露 CLIProxyAPI 管理密钥或通用管理请求设施。Issue #651 交付该需求的数据面：探测构造、payload 解析、窗口归一与脱敏，先于将来注入出站通道的运行时拥有方（#650）。

## Decision

该能力是纯库 [`@deepseek-ai/dsh-cliproxy-quota`](../../../../packages/llm/cliproxy-quota/README.zh.md)，不是 cordis 插件，也不是 capability seam。它只导出一个工厂——`createQuotaObserver({ transport })`——并定义由运行时拥有方注入的窄 `QuotaObservationTransport` 契约。库不持有进程、不持有管理密钥、不做调度；其 invariant 伴生注册一个带说明的空安装器。

探测构造、payload 解析与窗口归一移植自官方 CLIProxyAPI 管理中心（router-for-me/Cli-Proxy-API-Management-Center，提交 `ed5f1c48e11ba7335f1e8f676f228c280196af85`，MIT），而不是凭 UI 证据重造。包内 NOTICE 携带许可证全文、上游提交与模块级迁移映射；每个移植模块的 JSDoc 注明其上游来源。裁剪是刻意的：移除 i18next 与主题耦合（窗口身份是稳定键，展示命名归消费方的语言环境），且缺失计数器绝不默认成零——尽管管理中心的展示行曾经这样做。

移植在构造上只读。上游 xAI 付费探活把 `/v1/me` 与一次真实 chat completion 配对，因此未移植，付费 xAI 账号报告 `unsupported`；Codex reset-credit 的 consume 操作在本包不存在，只读列表计数保留。除请求体仅含项目 id 的 Antigravity quota-summary POST 外，所有探测均为 GET。

观测真值语义遵循提案：`known` / `partial` / `unsupported` / `failure` 加采样时刻；来源未提供的窗口字段保持缺失，来源未确立时长时 `periodHours: null`（Antigravity 仅接受 `5h`/`five-hour`/`five_hour` 与 `weekly`/`week`）。消费方通过比较 `observedAt` 保留过期样本；observer 不重试、不缓存、不虚构。错误信息有界且经凭据脱敏——尽管探测从不接收凭据。

GLM 不带探测地加入 provider 联合：fork 核心自行轮询 GLM 额度并记录在 auth-file 的被动额度信封上，因此 observer 的 `glm` 路径只解析作为探测输入提供的 `quotaSignals` 信封（`GLM-Quota-Status` ready→known、stale→partial 保留最后良好窗口、error→failure 带脱敏上游细节；5h/weekly 百分比+重置窗口；`GLM-Plan-Level` 作套餐标记），绝不触碰 transport。信号键跟随 `gestaltrun/CLIProxyAPI` head `68278c54` 的实现，在评审后的最终 pin 落定前保持暂定。

按核心裁决，额度观测仅是展示与诊断事实，usage quota 绝不驱动调度：任何探测结果都不会停用 auth、改变 `Quota.Exceeded` 或改变路由；凭据有效性信号报告的是额度接口的当前观察，而非推理 key 的整体健康状况。消费方通过 `status` 加 `observedAt` 区分过期与失败，并可保留最近一次已知良好的观测。

## Alternatives considered

**注册 cordis 服务让消费方经 `ctx` 发现 observer。** 不采用：不存在第二个消费方为 Service Definition / Provider / Consumer seam 提供正当性，且 transport 无论如何都必须归 Host 持有。

**保留上游 xAI `/v1/me` 档案读取作为付费档降级信号。** 不采用：不含额度计数器的档案不会改变 `unsupported` 判定，保留只会把一条行为规则拆到两条探测路径上。

**移植管理中心用于套餐元数据的 Claude profile 请求。** 不采用：Codex 的 usage payload 自带 `plan_type`，提案也未要求其他 provider 的套餐标记；每次探测少一个请求让探测矩阵更诚实。

**像其他五家一样主动探测 GLM 额度。** 不采用：fork 核心已自行轮询 GLM 并在 auth-file 上记录被动信号；第二条请求路径会重复轮询，还可能与核心自身的状态语义漂移。

## Consequences

测试经 fake trusted transport 覆盖每个 provider 的真实数据路径——允许的 URL、方法与请求字段，畸形与超限 payload（字节精确、多字节、已解码、超窗口数边界），含凭据形态的错误文本，五家探测的完整探测到观测组装，以及零请求的 GLM 信封组装——125 个测试，逐文件 100% 覆盖。fake 是 transport 契约的测试替身，不构成对真实 provider 端点的证据：Kimi、xAI、Antigravity 的 payload 形态仍只对上游管理中心的解析器验证过，GLM 信号键在评审后的 fork pin 落定前保持暂定，漂移将以 `failure` 或 `partial` 呈现而非虚构数值。本包冻结的接口——branded `QuotaAccountRef` 探测输入、transport、观测——是交给 #650 运行时拥有方的交接契约。独立评审在上游之上收紧了真值规则：Kimi 周期仅从显式 `duration`+`timeUnit` 推导，Codex 缺时长窗口保留位置键 `primary`/`secondary`，无额度计数器的 xAI 周期不是额度事实。

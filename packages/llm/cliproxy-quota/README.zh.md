---
description: "CLIProxyAPI 只读额度观测：经 trusted transport 探测账号池凭据，并给出脱敏的分提供方窗口。"
kind: "package-library"
---

# @deepseek-ai/dsh-cliproxy-quota

[English](README.md) | 中文

## 概述

CLIProxyAPI 账号池凭据的只读额度观测。`createQuotaObserver({ transport })` 经注入的 trusted transport 探测一个账号，返回脱敏的 `QuotaObservation`：`known` / `partial` / `unsupported` / `failure` 判定、`observedAt` 与逐窗口事实。本包不持有密钥，也不变更账号。不发布运行时 invariant 伴生体，因为本库没有事件流或可变运行时数据。

## 目录

- [信任与只读模型](#trust-and-read-only-model)
- [观测语义](#observation-semantics)
- [Provider 探测](#provider-probes)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="trust-and-read-only-model"></a>
## 信任与只读模型

本包不持有 CLIProxyAPI 管理密钥，也从不接触账号凭据。探测请求头携带字面量 `$TOKEN$` 占位符，只有 Host 持有的 `QuotaObservationTransport` 在经管理 API 请求设施转发时才会替换它。运行时拥有方注入该 transport；本包只定义其窄接口（`QuotaProbeRequest` / `QuotaProbeResponse`）。

所有探测均为只读：GET 请求，外加请求体仅含项目 id 的 Antigravity quota-summary POST。本包不发送任何推理请求（上游 xAI 付费探活把 `/v1/me` 与一次 chat completion 配对，未移植），也不执行任何变更操作（Codex reset-credit 的 consume 操作在此不存在）。付费 xAI 账号报告 `unsupported`；当 Host 侧推导的档位未知且 billing 端点无产出时，观测如实说明而不是猜测。

<a id="observation-semantics"></a>
## 观测语义

来源未提供的窗口字段保持缺失——没有任何值会被读成零、满额或虚构的余额。`periodHours: null` 表示来源未确立窗口时长（Antigravity 接受 `5h`/`five-hour`/`five_hour` 与 `weekly`/`week`；其他拼写保留余额与重置事实但不给时长；Kimi 仅从显式 `duration`+`timeUnit` 推导周期；只有周期没有任何额度计数器的 payload 不是额度事实）。重置时刻从 ISO-8601、Unix 秒或毫秒、或相对采样时钟的秒偏移解析。消费方通过比较 `observedAt` 保留过期样本；observer 自身不重试、不缓存、不调度。

所有保留值均有界：超过 1 MiB UTF-8 字节的探测响应使观测失败（原始文本按编码字节计量，多字节正文无法从字符计数下钻空子，已解码 body 在重新序列化后计量）；声称超过 256 个额度窗口的 payload 大声失败而不是发出无界数组。账号引用是 branded `QuotaAccountRef`；空引用在 observe 边界拒绝。

`known` 表示该 provider 探测期望的事实全部到达；`partial` 表示部分到达（Claude 命名窗口缺失、Codex reset-credits 列表失败、xAI 两个 billing 周期只得其一）；`failure` 表示无可用事实（错误信息有界且经凭据脱敏）；`unsupported` 表示该账号状态没有只读探测。

观测仅是展示与诊断事实。它们绝不停用账号、改变路由或设置耗尽状态；凭据有效性信号反映的是额度接口的当前观察，而非推理 key 的整体健康状况。消费方通过 `status` 加 `observedAt` 区分过期与失败，并可跨刷新保留最近一次已知良好的观测。

<a id="provider-probes"></a>
## Provider 探测

| Provider | 端点 | 窗口事实 |
| --- | --- | --- |
| Claude | `GET api.anthropic.com/api/oauth/usage` | 命名窗口（`five_hour`、`seven_day*`）含 `utilization` + `resets_at`；`weekly_scoped` 的 Fable 限额取代 `iguana_necktie` |
| Codex | `GET chatgpt.com/backend-api/wham/usage`、`GET …/rate-limit-reset-credits` | 按 `limit_window_seconds` 分类的窗口（5h / 周 / 月键名）；缺时长的 payload 保留位置键 `primary`/`secondary` 且 `periodHours: null`；`plan_type`；只读 reset-credit 计数 |
| Antigravity | `POST cloudcode-pa…/v1internal:retrieveUserQuotaSummary`（daily、sandbox、prod 回退链） | bucket 含 `remainingFraction`、显式 `window`、`resetTime`；需要 auth-file 的 `projectId` 元数据 |
| Kimi | `GET api.kimi.com/coding/v1/usages` | `usage` 汇总加 `limits[]` 行，含计数器；周期仅取显式 `duration`+`timeUnit`（绝不从标签关键词推导） |
| xAI | `GET cli-chat-proxy.grok.com/v1/billing[?format=credits]` | 周额度百分比与月度美分计数；周期长度取自 payload 自身的起止区间 |
| GLM | 无——解析 fork 核心被动额度信封（`observed_at` + `signals`），由探测输入提供 | `GLM-Quota-Status`（`ready`→known、`stale`→partial、`error`→failure）、5h/weekly 百分比+重置窗口、`GLM-Plan-Level`；核心负责轮询，本包绝不重复请求 |

GLM 路径是 fork GLM 订阅账号源的后续集成点：信号键跟随 `gestaltrun/CLIProxyAPI` head `68278c54` 的实现，在评审后的最终 pin 落定前保持暂定。

探测构造与 payload 归一移植自官方 CLIProxyAPI 管理中心（[router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)，提交 `ed5f1c48e11ba7335f1e8f676f228c280196af85`，MIT）；[NOTICE](NOTICE) 携带许可证全文与模块级迁移映射。`isPaidXaiCredential` 导出供 Host 从 auth-file 记录推导非秘密的 `xaiAccountKind` 元数据。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Kimi、xAI、Antigravity 的 provider payload 形态取自上游管理中心的解析器，未在本仓库对真实端点复验；漂移以 `failure` 或 `partial` 呈现，绝不虚构数值。
- Antigravity 探测依赖 auth-file 携带 GCP 项目 id；缺少该元数据的账号报告 `failure`（`antigravity account metadata lacks a project id`），直至账号名册提供该字段。
- Codex 窗口分类对缺少 `limit_window_seconds` 的 payload 保留上游的 primary/secondary 顺序回退；未来若上游发出多个无法分类的窗口对，会坍缩到同样两个键。
- Kimi 的 `periodHours` 仅取显式 `duration`+`timeUnit` 元数据；上游的标签关键词回退与未知单位默认分钟被刻意移除——二者都不是时间依据——因此仅有关键词或无单位的窗口报告 `periodHours: null`（标签与行序不受影响）。Codex 经旧版 primary/secondary 顺序回退分类的窗口保留位置键 `primary`/`secondary` 并携带 `periodHours: null`，直至 payload 给出 `limit_window_seconds`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

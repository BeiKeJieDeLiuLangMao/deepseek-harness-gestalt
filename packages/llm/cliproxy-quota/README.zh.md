# @deepseek-ai/dsh-cliproxy-quota

[English](README.md) | 中文

CLIProxyAPI 账号池凭据的只读额度观测。唯一入口 `createQuotaObserver({ transport })` 经注入的 trusted transport 探测一个账号，返回脱敏的 `QuotaObservation`：`known` / `partial` / `unsupported` / `failure` 判定、采样时刻 `observedAt`，以及逐窗口事实。

## 信任与只读模型

本包不持有 CLIProxyAPI 管理密钥，也从不接触账号凭据。探测请求头携带字面量 `$TOKEN$` 占位符，只有 Host 持有的 `QuotaObservationTransport` 在经管理 API 请求设施转发时才会替换它。运行时拥有方注入该 transport；本包只定义其窄接口（`QuotaProbeRequest` / `QuotaProbeResponse`）。

所有探测均为只读：GET 请求，外加请求体仅含项目 id 的 Antigravity quota-summary POST。本包不发送任何推理请求（上游 xAI 付费探活把 `/v1/me` 与一次 chat completion 配对，未移植），也不执行任何变更操作（Codex reset-credit 的 consume 操作在此不存在）。付费 xAI 账号报告 `unsupported`；当 Host 侧推导的档位未知且 billing 端点无产出时，观测如实说明而不是猜测。

## 观测语义

来源未提供的窗口字段保持缺失——没有任何值会被读成零、满额或虚构的余额。`periodHours: null` 表示来源未确立窗口时长（Antigravity 接受 `5h`/`five-hour`/`five_hour` 与 `weekly`/`week`；其他拼写保留余额与重置事实但不给时长）。重置时刻从 ISO-8601、Unix 秒或毫秒、或相对采样时钟的秒偏移解析。消费方通过比较 `observedAt` 保留过期样本；observer 自身不重试、不缓存、不调度。

`known` 表示该 provider 探测期望的事实全部到达；`partial` 表示部分到达（Claude 命名窗口缺失、Codex reset-credits 列表失败、xAI 两个 billing 周期只得其一）；`failure` 表示无可用事实（错误信息有界且经凭据脱敏）；`unsupported` 表示该账号状态没有只读探测。

## Provider 探测

| Provider | 端点 | 窗口事实 |
| --- | --- | --- |
| Claude | `GET api.anthropic.com/api/oauth/usage` | 命名窗口（`five_hour`、`seven_day*`）含 `utilization` + `resets_at`；`weekly_scoped` 的 Fable 限额取代 `iguana_necktie` |
| Codex | `GET chatgpt.com/backend-api/wham/usage`、`GET …/rate-limit-reset-credits` | 按 `limit_window_seconds` 分类的 `primary`/`secondary` 窗口（5h / 周 / 月）、`plan_type`、只读 reset-credit 计数 |
| Antigravity | `POST cloudcode-pa…/v1internal:retrieveUserQuotaSummary`（daily、sandbox、prod 回退链） | bucket 含 `remainingFraction`、显式 `window`、`resetTime`；需要 auth-file 的 `projectId` 元数据 |
| Kimi | `GET api.kimi.com/coding/v1/usages` | `usage` 汇总加 `limits[]` 行，含计数器、显式 `duration`+`timeUnit` 或标签关键词推导的周期 |
| xAI | `GET cli-chat-proxy.grok.com/v1/billing[?format=credits]` | 周额度百分比与月度美分计数；周期长度取自 payload 自身的起止区间 |
| GLM | 无——解析 fork 核心被动额度信封（`observed_at` + `signals`），由探测输入提供 | `GLM-Quota-Status`（`ready`→known、`stale`→partial、`error`→failure）、5h/weekly 百分比+重置窗口、`GLM-Plan-Level`；核心负责轮询，本包绝不重复请求 |

GLM 路径是 fork GLM 订阅账号源的后续集成点：信号键跟随 `gestaltrun/CLIProxyAPI` head `68278c54` 的实现，在评审后的最终 pin 落定前保持暂定。

探测构造与 payload 归一移植自官方 CLIProxyAPI 管理中心（[router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)，提交 `ed5f1c48e11ba7335f1e8f676f228c280196af85`，MIT）；[NOTICE](NOTICE) 携带许可证全文与模块级迁移映射。`isPaidXaiCredential` 导出供 Host 从 auth-file 记录推导非秘密的 `xaiAccountKind` 元数据。

## Known Limitations and Deferred Work

- Kimi、xAI、Antigravity 的 provider payload 形态取自上游管理中心的解析器，未在本仓库对真实端点复验；漂移以 `failure` 或 `partial` 呈现，绝不虚构数值。
- Antigravity 探测依赖 auth-file 携带 GCP 项目 id；缺少该元数据的账号报告 `failure`（`antigravity account metadata lacks a project id`），直至账号名册提供该字段。
- Codex 窗口分类对缺少 `limit_window_seconds` 的 payload 保留上游的 primary/secondary 顺序回退；未来若上游发出多个无法分类的窗口对，会坍缩到同样两个键。
- Kimi 的 `periodHours` 在显式时长元数据缺失时回退到标签关键词（`daily`/`weekly`/`monthly`/`5h`），与上游行为一致；无标签窗口得到 `null`。

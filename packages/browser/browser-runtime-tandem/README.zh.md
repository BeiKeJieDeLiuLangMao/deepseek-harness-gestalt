# @deepseek-ai/dsh-browser-runtime-tandem

[English](README.md) | 中文

这是 Browser Runtime 能力的托管式 Tandem Browser HTTP Service Provider。它以固定的上游 revision 启动并持有一个 Tandem 子进程，驱动其 loopback HTTP API，并通过 `ctx.browserRuntime` 暴露临时与命名持久 Browser Profile。出处记录见 [UPSTREAM.md](UPSTREAM.md) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；本包不 vendor 任何上游源码。

## 配置

| 字段 | 含义 | 默认值 |
|---|---|---|
| `command` | 用于启动固定 Tandem checkout 或包的可执行文件 | 必填 |
| `args` | 不经 shell 解释直接传递的参数 | `[]` |
| `cwd` | 作为 Tandem 子进程工作目录的已存在目录 | 必填 |
| `env` | 叠加在 subprocess 服务已脱敏父环境之上的显式环境 | `{}` |
| `baseUrl` | loopback Tandem HTTP API origin，含其配置端口 | 必填 |
| `tokenFile` | Tandem 写入其生成 API token 的本地文件 | 必填 |
| `idPrefix` | DSH 持有的不透明 Profile、Workspace 与浏览器身份前缀 | `tandem` |
| `startupTimeoutMs` | 子进程启动与 Tandem 健康验证的上限 | `60000` |
| `requestTimeoutMs` | 每次 Tandem HTTP 操作的上限 | `30000` |
| `healthPollMs` | 启动健康探测的间隔 | `250` |
| `pageSettleMs` | 单次内容读取允许上游页面稳定等待的上限 | `250` |
| `reconnectAttempts` | 意外退出后重启子进程的次数 | `2` |
| `reconnectDelayMs` | 每次重连尝试前的延迟 | `500` |
| `processGraceMs` | 释放时子进程树 SIGTERM 到 SIGKILL 的宽限 | `5000` |
| `maxResponseBytes` | 单个 Tandem HTTP 响应接受的最大字节数 | `10000000` |

`baseUrl` 必须是绝对的 loopback HTTP origin（主机为 `127.0.0.1`、`localhost` 或 `[::1]`，不含凭据、路径、查询或 fragment），否则插件加载失败。时长必须是正安全整数，`reconnectAttempts` 必须是非负安全整数。bearer token 从 `tokenFile` 读取，每次 HTTP 操作都携带它；启动健康检查在 `startupTimeoutMs` 内轮询 `GET /agent/version` 与 `GET /status`。

所有操作进入同一个串行队列。写操作要求调用方提供最后观察到的 `expectedRevision`；读操作返回当前修订号且不递增。人工 `input` 与 `takeover` 会把报告的 `controlOwner` 设为 `human`，并保持同一 Session、Profile、浏览器实例与标签页；`returnControl` 记录 Agent 所有权。锁是修订号。每个 Profile 映射到通过 `POST /sessions/create` 创建的一个 Tandem session 与一个 `persist:session-*` partition。命名 Profile 恢复该 partition；临时 Profile 使用唯一的 `tmp-N` session 名，且不留下可复用身份。同一命名 Profile 的第二个打开写入方会以 `BROWSER_PROFILE_BUSY` 拒绝。释放开始后的操作会以 `BROWSER_DISPOSED` 拒绝。释放阶段停止接收新操作、排空队列、通过 `POST /sessions/destroy` 销毁剩余 session，并在 `processGraceMs` 内 join 子进程树。

子进程意外退出或健康检查失败会提交一个 reason 为 `crashed` 或 `unhealthy` 的 `BrowserUnavailableState`，其 `reconnecting` 由配置决定，随后最多尝试 `reconnectAttempts` 次子进程重启；恢复成功后以同一 target、下一修订号重新提交打开页面状态，重连耗尽则提交 `reason: 'reconnect-failed'` 且 `reconnecting: false`。该投影是真实的：不可用期间，针对该 target 的操作会以 `BROWSER_RUNTIME_UNAVAILABLE` 拒绝，而不是报告过期的页面事实。格式错误的 Tandem 响应、超限响应体与字段校验失败会以 `BROWSER_PROTOCOL` 拒绝。

## 模型体验

通过 dsh-tool-browser 间接影响模型；该 Consumer 会渲染全部页面、截图、生命周期与可用性事实。

#### KV 缓存影响

Provider 自身不贡献请求文本；Consumer schema 与已记录结果决定缓存变化。

## 已知限制与后续工作

- 每个 Provider 生命周期只有一个 Tandem 子进程。后续 create 可以把另一个实例或标签页附加到已打开的 Profile。
- 对真实 Tandem Browser 运行需要固定 revision `3b613cfd4c299609ca7ca415d638c1b71c6ba5de` 的 checkout；单元测试运行在仓库内 HTTP fixture 上。
- 上游贡献候选——隔离 session 的安全栈与扩展加载、可持久化的 session registry、close/forget/wipe 存储擦除、MCP 工具 allowlist/profile、page-content 稳定等待上限、默认绑定全部接口的 API、ownership/handoff 事件流，以及一线 Linux 支持——列于 [UPSTREAM.md](UPSTREAM.md)。

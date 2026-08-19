# Agent Note: 开放注册配额与容量卸载

Status: implemented

[English](2026-08-19-open-registration-quotas-capacity.md) | 中文

## Problem

开放的 GitHub 注册会让单个账号或单个 IP 耗尽 Platform 安装、配对、密文上传、推送提示和在线连接。[Mobile Companion 提案](../../proposed/feature/2026-08-17-mobile-companion.md)已经拒绝允许名单、账号数量上限、自动扩容和运营停用控制台。配额数字是规格固定的安全不变量；只有双实例容量水位及其重试延迟随部署变化。配额辅助函数如果没有从登录、配对、附件或 WSS 接入路径调用，这些上限就不会被执行。

## Decision

Account 拥有登录侧上限以及共享的 `PlatformCapacityState` 类型：10 个在线 Desktop 安装、10 个在线 Mobile 安装、20 条并发被跟踪连接，以及 60 秒硬上限 `retryAfter`。完成 `pollLogin` 时，同一安装的再次登录会被接纳；第 11 个新的 Desktop 或 Mobile 会话以 `QUOTA` 拒绝。`trackConnection` 为每个账号接纳第 20 个 closer，下一次拒绝且不关闭已建立的 closer。注入的 `PlatformCapacityState` 会以 `PLATFORM_CAPACITY` 拒绝 `beginLogin` 和正在完成的 `pollLogin`。第二个 GitHub 身份仍可注册。`AccountBackend` 统计在线安装并解析账号与安装会话，因此 Postgres 与内存后端执行同一组上限。

Remote Access 拥有配对、附件和推送上限，并把 `MemoryPlatformCapacityGate` 实现为 `PlatformCapacityState`，因此 Account 不依赖 Remote Access。一个账号最多保留 50 个个人配对，每小时最多创建 10 个配对挑战；一个 IP 每小时最多创建 30 个。`admitAttachmentBlob`、`releaseAttachmentBlob` 与 `emitPushHint` 按声明大小执行 5 个并发附件、每附件 100 MiB、每账号每天 1 GiB 声明上传、每账号每天 500 条推送提示，不存储密文。确认配对会在握手激活之前检查 50 个配对上限。窗口类拒绝返回窗口剩余秒数，至少 1 秒；硬上限返回 60 秒。已建立的密文流和已确认配对不会被限流。容量卸载会拒绝新的登录、配对、附件和 WSS 接入，不会拒绝推送提示。

配对挑战 HTTP 只把 `req.socket.remoteAddress` 作为 `clientIp`。`x-forwarded-for` 可被客户端伪造，因此被忽略；可信代理映射仍属部署工作。HTTP 的 `QUOTA` 与 `PLATFORM_CAPACITY` 映射为状态 429、JSON 秒级 `retryAfter` 和 `Retry-After` 响应头。Relay 的 `tryAcquire` 为新 attachment 持有一个水位槽，替换时转移持有，并在关闭或接入失败时释放。每进程 `trackConnection` 映射执行 20 条连接的账号上限；它不是共享 Redis 计数器。

`decideOpenRegistration` 辅助函数在用量等于上限时仍接纳（使用 `>`），以便单元测试钉住精确上限。在线提供方在记录下一次事件前用 `>=` 比较当前用量。

实现不包含允许名单、账号数量上限、自动扩容或运营停用控制台。附件与推送 HTTP 操作只做配额准入；加密附件传输和产品推送投递仍属于[加密附件](../../proposed/feature/2026-08-17-mobile-companion.md)与推送工单。

## Alternatives considered

**只把 `decideOpenRegistration` 当作证据。** 该辅助函数不跑在登录、配对、附件或 WSS 路径上，通过它的单元测试不能证明这些上限。

**用 `x-forwarded-for` 作为每 IP 小时上限。** 客户端可以设置该请求头并逃出 IP 桶。没有可信代理时，本进程只能观察到 TCP 对端地址。

**只把已取消的配对挑战计入每安装保留记录上限。** 每小时账号与 IP 上限统计已签发的挑战。已清理的重放记录仍在五分钟后驱逐；清理失败的墓碑仍是跨小时持有十六条保留记录的方式。

**把全部上限放进 Remote Access，或让 Account 导入 Remote Access 类型。** 登录配额会反转 Account → Remote Access 依赖。Account 拥有登录身份；Remote Access 消费它。

**为 20 条连接上限共享 Redis 计数器。** 20 条连接上限是账号进程内映射，因为 `apps/platform` 启动时仍只有 Account、没有配对或 Relay。部署共享计数器仍是双实例证据缺口。

**把配额数字做成 cordis.yml Config。** Companion 提案把这些整数定为安全不变量。只有在线 WSS 水位和容量重试延迟保持为部署校验 Config。

**在容量到达时卸载已建立流或断开在线 attachment。** 双实例部署会保留现有连接，并拒绝新的获取，直到运营扩容。

**在这里实现产品附件存储和推送投递。** 那些协议属于被阻塞的附件与推送工单。按声明大小准入仍然执行开放注册上限。

## Consequences

开放注册可以保持开放且没有允许名单，同时单个账号或 IP 不能无界保留安装、配对、附件或推送提示。运营仍需手工扩展已购买的两台实例；CloudMonitor 仪表盘、生产共享容量水位、可信代理客户端 IP、跨实例连接计数器，以及真实附件和推送产品路径，仍属部署或后续工作。尚未授权会话的冷实例在 `authorizeAccess` 或正在完成的 `pollLogin` 绑定该会话之前不执行连接上限。每安装的在线、待确认和保留配对上限与账号范围配额同时生效；清理失败墓碑填满十六条记录上限时，安装可能先碰到 `PAIRING_RESOURCE_LIMIT` 再碰到 `QUOTA`。

## Testing

Account 单元测试钉住第 10、11 个 Desktop 与 Mobile 安装、同一安装替换、第 20、21 次 `trackConnection`、第二个 GitHub 身份，以及登录卸载。Loader 加真实 TCP 的 Account HTTP 场景重复这些边界。Remote Access 单元测试钉住每小时账号与 IP 挑战、在重放保留和小时窗口推进下的 50 个配对、5 个并发附件、100 MiB 附件上限、精确 1 GiB 声明日字节、500 条推送提示、配额与卸载下的流准入，以及容量卸载后仍能列出已建立配对。真实 Personal Pairing HTTP 重复小时、配对、附件、推送和容量信封，并证明伪造的转发头不会隔离第二个 IP 桶。Relay 测试持有一个水位槽，以 gate 重试延迟拒绝新 attach，保留已建立接收路径，并在关闭或鉴权失败时释放。客户端保留 `QUOTA` / `PLATFORM_CAPACITY` 与整数 `retryAfter`。

## Related

- [Mobile Companion 提案](../../proposed/feature/2026-08-17-mobile-companion.md) —— 父级开放注册与容量决策。
- [Platform 账号安装会话](2026-08-17-platform-account-installation-sessions.md) —— 这些安装与连接上限所统计的会话。

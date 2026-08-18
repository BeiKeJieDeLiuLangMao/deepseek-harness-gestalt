# `@deepseek-ai/dsh-remote-access`

[English](README.md) | 中文

远程访问 Service Definition 与个人配对 Service Provider。`ctx.remoteAccess` 对每个 Desktop 安装默认关闭手机访问，直到用户在设置中开启；它创建两分钟单次邀请，通过 `AccountService.currentInstallation()` 鉴别每个账号会话的安装 id 与类型，要求两个安装解析到同一账号，并且仅在 Desktop 明确确认后授予设备主体。调用方不能自行声明安装身份或类型。`PersonalPairingAuthorityStore` 原子持有共享的 Desktop access-to-route 关联与已确认 Mobile 配对结果；内存适配器只用于无密钥测试，部署必须向每个 Platform Instance 提供同一个持久适配器。

QR 载荷与完整的一次性 HTTPS 链接完全相同，携带 256 位邀请密钥、Desktop 指纹、rendezvous id、过期时间与协议主版本。握手完成后保持待确认，两个安装显示由握手哈希派生的同一组六个认证词。过期、取消、账号不匹配、拒绝、一次成功完成与关闭手机访问都会销毁对应的密码提供方能力。完成 id 与确认 id 保证重试幂等，串行变更保证并发完成只有一个获得邀请。

系统先提交终态，再清理提供方资源。挑战或待确认密钥销毁失败时，资源会保留在可重试清理记录中；客户端重试仍观察原有的完成、确认、取消、拒绝或过期结果，不会重复握手或激活。每个已鉴权安装最多持有四个存活挑战、四个待确认配对，以及合计十六条存活或为重放保留的生命周期记录。清理完成的幂等重放投影在五分钟后淘汰；清理失败的终态记录会继续占用容量，直到销毁成功。失去流程记录的待确认密钥会同时计入所属桌面安装和移动端安装，但不会与已结算记录重复计数。挑战创建时就调度过期任务。共享 authority 的释放仍会结算本实例创建的存活挑战，避免创建进程退出后永久占用每安装上限。提供方释放资源时会排空实例本地的未完成工作，但保留已确认配对与 route 权限，使滚动替换能够重连；只有显式关闭才负责持久撤销。生成的不透明 id 或密钥引用发生碰撞时会立即失败且不覆盖既有记录；激活分配在解析公开引用或生成 id 之前就归清理流程持有。

`PairingHandshakeProvider` 是唯一的密码适配器。本包不实现 Noise，也不派生配对密钥。每次激活返回公开的带品牌密钥引用和一个独立的提供方私有分配句柄；回滚只销毁本次新分配，无法寻址既有配对密钥。确认配对后，系统先用配对密钥封装 Mobile 专用 Relay 权限，再由共享存储发布已配对结果。Mobile 通过自身的密码适配器打开该值并配置自己的 Relay 生命周期，绝不会收到或复用 Desktop Relay 凭据。生成的设备主体只有 `companion-surface` 权限。HTTP 消费方与共用 HTTP 传输把 `ctx.remoteAccess` 连接到 Desktop 设置和 Mobile 控制器。Mobile 将尚未发送的准备结果保留到邀请过期，将可能已提交的请求保留到服务端重放期限，并将待确认结果保留到明确终态；每次重试都会复用同一个完成 id 和握手字节。账号变化会清除上一账号的控制器投影与重试状态。两个控制器都会在退出账号或卸载时停止计时器，排空包括原生扫码在内的进行中工作，并拒绝之后的配对操作。loader 示例通过明确标记为未评审的无密钥提供方运行这条控制器／HTTP 路径；它不是产品密码实现。

`ctx.remoteRelay` 拥有无状态多实例 Relay 生命周期。32 字节可轮换 Desktop 凭据在进入持久 `RelayRouteStore` 前会被哈希；已确认的 Mobile endpoint 在同一 route revision 获得独立签发的凭据，仅凭不透明 route id 无法 attach。每个 Platform Instance 先鉴权 attachment 并刷出 ready，再把它注册到会过期的共享目录，并直接发布到目标实例。跨实例事件只包含有界 Relay 密文、带品牌 transport id、连接 token 与 route revision。目标缺失时返回 `REMOTE_OFFLINE`，不存在离线密文或 mutation queue。容量限制只拒绝新 attachment，慢消费者在配置的字节上限处断开，心跳重新验证 route 权限，轮换或撤销会跨实例使旧在线 attachment 失效。

部署持久状态仅限 route identity、credential digest、单调 revision 与撤销／关联状态。临时协调仅限会过期的 attachment 位置、失效事件与直达密文 Pub/Sub。实例退出会关闭其 socket；Mobile 与 Desktop 获取新的 non-sticky 连接，Desktop 发送权威加密 resync，而不迁移在线 socket。容量、目录、心跳、缓冲、连接与 attach timeout 都是组合中显式校验的配置值。

## Model Experience

无，因为配对元数据、设备主体来源与设置状态从不进入模型请求。

#### KV Cache effect

无。

## Known Limitations and Deferred Work

- 在独立评审者接受 Snow 证明且组装经过评审的 `PairingHandshakeProvider` 之前，产品激活保持 fail-closed。
- 个人配对 challenge 与待确认握手记录仍使用随附的单进程提供方。已确认的 pairing-to-route/access 权限与 Relay route store 都是部署拥有的 seam；本仓库不供应 PostgreSQL、Redis、TLS 或云实例。
- Relay transport 可用不等于产品加密获批。在独立 Noise gate 接纳经过评审的握手与 Companion channel provider 之前，生产 Desktop 组合保持 fail-closed。

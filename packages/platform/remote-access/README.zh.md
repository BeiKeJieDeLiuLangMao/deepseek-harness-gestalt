# `@deepseek-ai/dsh-remote-access`

[English](README.md) | 中文

远程访问 Service Definition 与单进程个人配对 Service Provider。`ctx.remoteAccess` 对每个 Desktop 安装默认关闭手机访问，直到用户在设置中开启；它创建两分钟单次邀请，通过 `AccountService.currentInstallation()` 鉴别每个账号会话的安装 id 与类型，要求两个安装解析到同一账号，并且仅在 Desktop 明确确认后授予设备主体。调用方不能自行声明安装身份或类型。

QR 载荷与完整的一次性 HTTPS 链接完全相同，携带 256 位邀请密钥、Desktop 指纹、rendezvous id、过期时间与协议主版本。握手完成后保持待确认，两个安装显示由握手哈希派生的同一组六个认证词。过期、取消、账号不匹配、拒绝、一次成功完成与关闭手机访问都会销毁对应的密码提供方能力。完成 id 与确认 id 保证重试幂等，串行变更保证并发完成只有一个获得邀请。

系统先提交终态，再清理提供方资源。挑战、待确认密钥或活跃密钥销毁失败时，资源会保留在可重试清理记录中；客户端重试仍观察原有的完成、确认、取消、拒绝或过期结果，不会重复握手或激活。挑战创建时就调度过期任务；提供方释放资源时通过 all-settled 聚合尝试清理全部活跃资源与保留资源。生成的不透明 id 或密钥引用发生碰撞时会快速失败且不覆盖既有记录；任何已新分配的资源仍由清理记录持有。

`PairingHandshakeProvider` 是唯一的密码适配器。本包不实现 Noise，也不派生配对密钥。每次激活必须返回唯一、由提供方拥有且带品牌的密钥引用；生成的设备主体只有 `companion-surface` 权限。HTTP 消费方与共用 HTTP 传输把 `ctx.remoteAccess` 连接到 Desktop 设置和 Mobile 控制器。loader 示例通过明确标记为未评审的 keyless 提供方运行这条控制器／HTTP 路径；它不是产品密码实现。

## Model Experience

无，因为配对元数据、设备主体来源与设置状态从不进入模型请求。

#### KV Cache effect

无。

## Known Limitations and Deferred Work

- 在独立评审者接受 Snow 证明且组装经过评审的 `PairingHandshakeProvider` 之前，产品激活保持 fail-closed。
- 随附提供方持有单进程状态。持久化多实例存储、Relay 路由与撤销扇出不属于本包；本包不实现 issue #32 规划的跨实例 Relay。

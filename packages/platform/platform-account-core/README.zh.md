# `@deepseek-ai/dsh-platform-account-core`

[English](README.md) | 中文

本包是 Platform 账号提供方。登录尝试有效期为五分钟，携带随机 OAuth state 与 S256 PKCE，只能凭签名轮询令牌和 P-256 安装证明消费一次。GitHub OAuth 适配器不请求 scope，拒绝继承得到的非空 scope，只保留不可变数字 id、公开登录名和头像，并在身份查询后丢弃提供方令牌。

账号会话把一个账号绑定到一个安装密钥。访问令牌有效期为 15 分钟；刷新令牌每次使用都轮换，最长有效期为 30 天。当前账号读取、刷新和退出都要求新鲜且未重放的证明。替换或退出会话会发布失效事件，让每个 Platform 实例关闭该会话下已跟踪的连接。

`validatePlatformEnvironmentPair` 会拒绝开发与生产环境共享 origin、回调、GitHub OAuth App id、凭证命名空间、数据库命名空间或身份命名空间。

## 扩展点

`AccountBackend` 提供原子持久化，`AccountInvalidationBus` 提供跨实例投递，`GitHubIdentityProvider` 拥有提供方交换。生产 composition root 提供三者；内存实现只用于无密钥验收与开发。

## 模型体验

无。账号授权位于 agent 会话与模型请求之外。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 本包不提供生产数据库、分布式失效、密钥管理、限流器或审计接收器；这些适配器归 Platform 部署 composition root 所有。
- GitHub 适配器只支持 OAuth Apps，并以无提供方 scope 的方式接收公开身份。

# `@deepseek-ai/dsh-platform-account-client`

[English](README.md) | 中文

本包是 Desktop 与 Mobile 共用的安装客户端。它在授权前展示唯一规范的中英文数据保留说明，创建 P-256 密钥，在用户激活打开系统浏览器前准备好五分钟登录尝试，再以签名轮询完成授权。恢复会话时，只有在 Platform 确认访问令牌或轮换刷新令牌之后才显示账号。

`PlatformAccountHttpTransport` 只接受从已校验开发／生产环境对中选出的身份，并从 `unknown` 解析每种响应。`IndexedDbInstallationAccountStore` 解析持久化记录，要求真正的 P-256 私有签名 `CryptoKey`，并保存不可导出的 Mobile WebCrypto 密钥与账号会话；Desktop 复用相同传输，但使用 Electron Host 拥有的加密存储。一个可关闭的 `AccountLifecycleTransitions` owner 串行化加载、登录、轮询、刷新、切换与退出，避免并发恢复清除或复活较新的会话，并让关闭过程排空已经接纳的工作。快照发布会分别隔离每个订阅方，并在后续订阅方运行后才报告失败。单个安装切换账号时，`accountStorageNamespace` 为配对密钥、缓存与回执提供按账号和环境隔离的前缀。

## 模型体验

无。控制器不会贡献模型可见状态。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 本库不实现个人配对或远程访问。
- Mobile 原生打包必须提供稳定的 WebView 存储 origin；Mobile composition 自己拥有 Capacitor Browser 适配器。

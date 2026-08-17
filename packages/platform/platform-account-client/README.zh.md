# `@deepseek-ai/dsh-platform-account-client`

[English](README.md) | 中文

本包是 Desktop 与 Mobile 共用的安装客户端。它在授权前展示一份中英文数据保留说明，创建 P-256 密钥，通过注入的系统浏览器适配器打开 GitHub URL，再以签名轮询完成五分钟登录尝试。恢复会话时，只有在 Platform 确认访问令牌或轮换刷新令牌之后才显示账号。

`PlatformAccountHttpTransport` 从构建拥有的开发／生产配置中选择一个可信 HTTPS origin。`IndexedDbInstallationAccountStore` 持久化不可导出的 Mobile WebCrypto 密钥和账号会话；Desktop 复用相同传输，但使用 Electron Host 拥有的加密存储。单个安装切换账号时，`accountStorageNamespace` 为配对密钥、缓存与回执提供按账号和环境隔离的前缀。

## 模型体验

无。控制器不会贡献模型可见状态。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 本库不实现个人配对或远程访问。
- Mobile 原生打包必须提供系统浏览器 opener 与稳定的 WebView 存储 origin。

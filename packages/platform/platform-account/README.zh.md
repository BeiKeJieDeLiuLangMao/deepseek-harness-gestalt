# `@deepseek-ai/dsh-platform-account`

[English](README.md) | 中文

本包定义 Platform 账号身份及绑定到单个 Desktop 或 Mobile 安装的账号会话服务。`AccountService` 通过 `ctx.platformAccount` 拥有登录尝试创建、GitHub 回调完成、签名轮询、访问令牌刷新、当前账号读取、当前安装退出登录和连接跟踪。

公共类型对账号、登录尝试和账号会话 id 使用品牌类型。`AccountError` 为无效或过期尝试、无效或重放证明、过期或已撤销会话提供稳定错误码。

## 模型体验

无。Platform 账号状态不对模型可见，不增加消息、工具或提示词文本。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 账号删除、会话列表、远程退出、全部退出、恢复和身份关联不属于本服务。
- 个人配对是独立能力，`signOut` 永远不会删除它。

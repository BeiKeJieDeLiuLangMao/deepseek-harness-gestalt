# `@deepseek-ai/dsh-platform-account`

[English](README.md) | 中文

本包定义 Platform 账号身份及绑定到单个 Desktop 或 Mobile 安装的账号会话服务。`AccountService` 通过 `ctx.platformAccount` 拥有登录尝试创建、GitHub 回调完成、签名轮询、访问令牌刷新、当前账号读取、已鉴别当前安装读取、当前安装退出登录和连接跟踪。`currentInstallation()` 会随账号投影返回由提供方绑定的安装 id 与类型，因此其他能力无需读取账号表，也无需信任调用方自行声明的角色。

公共类型对账号、登录尝试、账号会话、安装和证明 JTI id 使用品牌类型。运行时 `AccountError` 为无效或过期尝试、无效或重放证明、过期或已撤销会话提供稳定错误码；`./types` 子路径保持仅含类型。

## 模型体验

无。Platform 账号状态不对模型可见，不增加消息、工具或提示词文本。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 账号删除、会话列表、远程退出、全部退出、恢复和身份关联不属于本服务。
- 个人配对是独立能力，`signOut` 永远不会删除它。

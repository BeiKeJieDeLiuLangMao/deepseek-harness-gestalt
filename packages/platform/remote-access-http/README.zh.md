# 远程访问 HTTP

[English](README.md) | 中文

公开远程访问服务的 HTTP 与 WSS 消费方。一个固定 HTTP 路由接收当前安装的账号证明请求头、校验操作输入，并且只通过 `ctx.remoteAccess` 委派。精确 WSS 路径只接收 Relay Transport frame，并通过 `ctx.remoteRelay` 委派已鉴权 attachment。

消费方不读取账号数据库字段，也不自行授予权限。远程访问提供方会在任何配对生命周期变更前，通过平台账号公开服务鉴别账号、安装标识及安装类型。

WSS 消费方要求第一帧必须是 attach，执行显式 attach deadline 与协议消息字节上限，关闭压缩，串行处理 frame，并且只在鉴权与目录注册完成后发送匹配的 ready acknowledgement。它随 socket 一起清理 Relay attachment，并且只返回不含内容的稳定 transport error。TLS 终止与单个 non-sticky endpoint 仍由部署负责。无密钥组装测试会通过 Loader 启动两个 Platform Instance，它们共享测试用的 route、配对权限与 Redis coordinator 适配器，并通过一个本地 non-sticky TLS 监听器接入 Mobile 与 Desktop。

## 模型体验

无。HTTP 消费方在模型请求之外处理配对状态。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- WSS 消费方只转发不透明 Relay 密文；它从不接受 Host request 或 Companion 明文。
- 部署 TLS、边缘限制与审计策略仍由 Platform 组合负责。

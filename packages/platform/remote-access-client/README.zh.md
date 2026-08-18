# 远程访问客户端

[English](README.md) | 中文

面向公开远程访问服务的 Desktop 与 Mobile 鉴权 HTTP 传输。每次操作转发一份当前安装的账号证明，并在暴露带品牌的个人配对标识符前校验所有 JSON 响应。

客户端不实现握手，也不存储配对密钥。产品控制器提供已登录账号的鉴权信息，并使用平台部署选择、已经独立评审的服务端握手提供方。

`RemoteRelayEndpointController` 通过部署的单个 non-sticky Platform endpoint，拥有一条出站 Mobile 或 Desktop WSS 生命周期。每条物理连接都取得新的 attachment id，并使用当前不透明 route id 与可轮换高熵凭据完成鉴权。socket 丢失后会在已校验的重试延迟后建立新连接；Desktop 在每次 attachment 后发送权威加密 resync。断开期间发送会以 `REMOTE_OFFLINE` 失败，且绝不保留或重放。

Desktop 设置所有者只在手机访问开启期间启动该生命周期。关闭窗口会退出 Desktop 进程；sleep、quit、退出账号或关闭手机访问都会停止并排空 socket。不存在 daemon、后台 Host 或 remote wake 路径。

## 模型体验

无。远程访问传输值不会进入模型请求。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 原生与浏览器 WSS adapter 由组合负责；本包拥有生命周期与编码后的 Relay frame。
- 生产使用仍要求 Platform 部署组装经过评审的握手提供方。

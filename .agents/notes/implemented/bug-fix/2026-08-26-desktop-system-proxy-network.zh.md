# Agent Note: Desktop Platform 流量使用 Electron 系统代理

Status: implemented

[English](2026-08-26-desktop-system-proxy-network.md) | 中文

## 问题

Desktop Platform Account 与 Remote Access HTTP 使用 Node 全局 Fetch，Relay WSS 使用直连 Node socket。这些路径不会采用 Electron 选择的操作系统代理。在有效的 macOS 系统代理配置下，即使同一个生产 Platform 通过已配置代理保持健康，打包 Desktop 仍会在 GitHub 登录前显示 `fetch failed`。

## 决策

Desktop 持有的 Platform Account、Remote Access 与附件 HTTP 使用单请求官方 Node helper，Relay WSS 使用另一个官方 Node helper。每次请求或新的 WSS 建连前，Desktop 都会在所属操作的 deadline 与 cancellation 内，针对实际运行 URL 调用 `Session.resolveProxy`。两个 helper 使用同一份有序 `PROXY`、`HTTPS` 与 `DIRECT` candidate。只有同一结果还提供受支持 candidate 时，解析才会跳过不支持的指令；非空结果若全部不受支持，会明确失败，不会产生隐式直连 route。Connection-refused、reset、unreachable、broken-pipe 与 timeout failure 会进入下一个 candidate；certificate、protocol 与其他 failure 会停止，不会绕过所选 route。

## 考虑过的替代方案

**读取 `HTTP_PROXY` 与 `HTTPS_PROXY`。** 未采用，因为打包 GUI 应用不会可靠继承 shell 变量，而且这些值可能与当前 Electron session 不一致。

**要求用户关闭代理。** 未采用，因为这会让实际运行产品依赖本地网络绕行方式，并且不符合同一应用中 Chromium 的行为。

## 结果

Desktop HTTP 与 Relay WSS 共享操作系统路由决策，无需在产品产物中嵌入代理地址或凭据。Mobile 继续使用原生 WebView 网络栈。WSS adapter 在 CONNECT 后仍会校验 Platform 证书。

## 测试

单元覆盖会证明 Electron Fetch 转发、有序 `DIRECT`、HTTP 与 HTTPS candidate、从不支持指令继续到受支持 candidate、全部不支持时拒绝、DNS 与 connection fallback、有界 blackhole fallback、certificate failure 不 fallback、pending resolution 取消，以及 WSS agent 注入。Packaged-main 测试会让 CommonJS proxy agent 保持在 ESM bundle 外部。实际运行验收使用启用 macOS 系统代理的打包 Desktop 与生产 Platform origin。

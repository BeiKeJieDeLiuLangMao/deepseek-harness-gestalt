# @deepseek-ai/dsh-browser-runtime-deterministic

[English](README.md) | 中文

这是服务一个临时 Profile、一个 Workspace、一个浏览器实例与一个标签页的确定性无密钥 Browser Runtime Provider。它是可运行 tracer 与 fixture 后端，不是操作系统浏览器。

## 配置

`idPrefix` 控制稳定的不透明 fixture 身份，默认值为 `browser-trace`。必填 `pages` 条目包含 `url`、`title`、`text` 与 `screenshotPngBase64`；截图数据必须是非空 canonical base64，且解码后的字节以 PNG signature 开头。空页面集合、重复 URL 与无效截图会让插件加载失败。

所有操作进入同一个串行队列。写操作要求当前修订号，读操作返回当前修订号且不递增。一个 Provider 实例只接收一个临时 Profile 生命周期：关闭后再次 `create` 会以 `BROWSER_CAPACITY` 拒绝；释放开始后的操作会以 `BROWSER_DISPOSED` 拒绝。释放阶段停止接收新操作、排空已接受操作，并关闭仍打开的临时 Profile。

Provider state 是权威来源。其 invariant companion 在首次安装与热重载时从该状态建立基线，随后为身份、精确修订顺序与终态关闭注册同步 pre-commit validator。invariant 失败时，原 state 仍是权威来源。`browser/runtime-state` 是受容纳的提交后通知，因此损坏的普通 observer 不会让已提交操作表现为失败。

## 模型体验

通过 dsh-tool-browser 间接影响模型；该 Consumer 会渲染全部确定性页面与生命周期事实。

#### KV 缓存影响

Provider 自身不贡献请求文本；Consumer schema 与已记录结果决定缓存变化。

## 已知限制与后续工作

- 导航只对配置的 fixture URL 成功；cookie 持久化、人工接管、多身份与原生浏览器自动化均刻意不在本包中。

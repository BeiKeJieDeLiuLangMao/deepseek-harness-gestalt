# @deepseek-ai/dsh-browser-runtime-deterministic

[English](README.md) | 中文

这是服务一个临时 Profile、一个 Workspace、一个浏览器实例与一个标签页的确定性无密钥 Browser Runtime Provider。它是可运行 tracer 与 fixture 后端，不是操作系统浏览器。

## 配置

`idPrefix` 控制稳定的不透明 fixture 身份，默认值为 `browser-trace`。必填 `pages` 条目包含 `url`、`title`、`text` 与 `screenshotPngBase64`。空页面集合、重复 URL 与无效 base64 会让插件加载失败。

所有操作进入同一个串行队列。写操作要求当前修订号，读操作返回当前修订号且不递增。释放阶段停止接收新操作、排空已接受操作、关闭仍打开的临时 Profile，并使 Provider 不可再用。

## 模型体验

通过 dsh-tool-browser 间接影响模型；该 Consumer 会渲染全部确定性页面与生命周期事实。

#### KV 缓存影响

Provider 自身不贡献请求文本；Consumer schema 与已记录结果决定缓存变化。

## 已知限制与后续工作

- 导航只对配置的 fixture URL 成功；cookie 持久化、人工接管、多身份与原生浏览器自动化均刻意不在本包中。

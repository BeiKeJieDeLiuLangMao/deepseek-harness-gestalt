# Agent Note: Explicit DeepSeek and Anthropic-protocol search cards

Status: implemented

[English](2026-08-19-moonshot-search-wire-adaptation.md) | 中文

## Problem

Gestalt 只发货一个 `web_search` 工具，以及一张覆盖 `web-search-deepseek` 的设置卡片。需要另一条 Anthropic Messages 搜索基址的用户——例如 Kimi coding 的 `https://api.kimi.com/coding/v1`——只能改写该卡片的 `baseURL`，并猜测这个字段要的是 DeepSeek Anthropic 基址、Kimi coding 基址，还是专用检索 URL。猜测会把协议混在一起。面向模型的工具仍然是一个 `web_search`；缺的是下一次搜索读取哪条 Messages 基址的显式选择。

## Decision

同一提供方仍然只讲 Anthropic Messages + `web_search_20250305`。设置页现在展示两张卡片：

- **DeepSeek 搜索**（`web-search-deepseek`）——官方 DeepSeek Anthropic 基址，默认 `https://api.deepseek.com/anthropic/v1`。
- **Anthropic 协议搜索**（`web-search-anthropic`）——由用户填写的 Messages 基址，例如 `https://api.kimi.com/coding/v1`。

DeepSeek 段存储 `backend: 'deepseek' | 'anthropic-messages'`。每张卡片的 **使用此搜索** 会写入该字段。提供方按次投影两段，并读取 `backend` 所点名的卡片。专用检索（`POST /v1/search` 带 `text_query`）是另一种协议，不属于本包。

## Alternatives considered

**根据已配置 URL 的主机或路径猜测协议。** 否决：`api.kimi.com/coding/v1` 是 Messages 搜索，`api.moonshot.cn/v1/search` 是检索，主机白名单会分错路。用户必须知道自己填的是哪一类 URL。

**再做一个 `WebSearchProvider` id，并在 `ctx.web` 里选择 `searchProvider`。** 暂缓：已发布组合把 `searchProvider` 固定为 `deepseek-official`，而且 `WebRuntime` 在构造时固化该 id。一张提供方 id 上的两张卡片只改页面，不改 seam 选择。

**一张卡片加协议下拉框。** 否决：两个入口需要不同文案和提示，用户才能对上官方 DeepSeek 与 Kimi coding，而不必去读下拉选项。

## Consequences

想用 Kimi coding 的用户选择 Anthropic 协议卡片，填入 `https://api.kimi.com/coding/v1`，并点击 **使用此搜索**。想用官方 DeepSeek 的用户选择 DeepSeek 卡片。另一张卡片上残留的 `baseURL` 不会被读取。Moonshot 专用搜索仍需要自己的提供方包。

## Testing

`packages/web/web-search-deepseek/tests/settings.spec.ts` 会切换 `backend`，并断言下一次搜索打到 Anthropic 卡片的 `{baseURL}/messages`。客户端卡片测试覆盖“使用此搜索”控件以及第二个命名空间的注册。plugin-config 快照列出两张卡片的标题。

## Related

- [Web 能力 seam](../architecture/2026-06-24-web-capability-seam.md) — 提供方注册能力；`dsh-tool-web` 拥有稳定的 `web_search` schema。
- [Web 插件配置](2026-08-10-web-plugin-configuration.md) — 设置卡片各自绑定一个命名空间。

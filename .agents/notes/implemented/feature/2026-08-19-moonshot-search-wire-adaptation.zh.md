# Agent Note: Moonshot dedicated-search wire adaptation on the shipped search provider

Status: implemented

[English](2026-08-19-moonshot-search-wire-adaptation.md) | 中文

## Problem

Gestalt 将 `searchProvider` 固定为 `deepseek-official`，并只通过 `web-search-deepseek` 命名空间暴露一张网页搜索设置卡片。已经持有 Kimi 密钥的用户会把该卡片的 `baseURL` 指到 Moonshot 专用搜索 URL（`https://api.moonshot.cn/v1/search`）。已发布提供方总是追加 `/messages`，并发送带 `web_search_20250305` 的 Anthropic Messages 请求体，因此请求落到 `…/v1/search/messages`，Moonshot 返回 `url.not_found`。面向模型的 `web_search` 工具仍然注册；出错的只是厂商协议格式。当同一张卡片仍指向 Anthropic 基址时，DeepSeek 官方搜索必须继续可用。

## Decision

`@deepseek-ai/dsh-web-search-deepseek` 会分类已配置的 `baseURL`，并在同一个提供方 id 下使用两种协议格式：

- 路径包含 `/anthropic`，或任何不是 Moonshot 专用搜索端点的 URL，继续走 DeepSeek Messages（`POST {baseURL}/messages`，携带 `web_search_20250305`）。
- 已知的 Moonshot／Kimi 主机（`api.moonshot.cn`、`api.moonshot.ai`、`api.kimi.com`、`api.kimi.ai`）或以 `/search` 结尾的路径，会按原样 POST 已配置 URL，请求体采用 Kimi CLI 的 `moonshot_search` 格式 `{text_query, limit, enable_page_crawling: false, timeout_seconds: 30}`，并把 `search_results[]` 映射为 seam 的 `WebSearchResult`。

设置卡片、凭据引用（`DEEPSEEK_API_KEY`）以及 `searchProvider: deepseek-official` 固定项均不改变。Moonshot 检索不写入 `web/deepseek-search-llm-request` 事件，因为它不是辅助模型轮次。两种格式都会在跟随 `Location` 之前拒绝 HTTP 重定向。`moonshot_fetch` 不在范围内：Gestalt 默认禁用 `web_fetch`。

## Alternatives considered

**再做一个由 `searchProvider` 选择的 `web-search-moonshot` 提供方包。** 本次变更否决：已发布组合把提供方固定为 `deepseek-official`，设置卡片也写死为 `web-search-deepseek`。在同时改掉固定项和卡片之前，第二个已注册提供方永远不会运行，也就修不好用户已经保存的 URL。

**在 `ctx.web` 内部按域名选择。** 否决：seam 按显式提供方 id 选择，或在“恰好只有一个可用提供方”时自动选择。让它认识各厂商 URL 族会把 Service Definition 耦合到 Moonshot 与 DeepSeek 主机，而且仍然需要第二个提供方并改写设置卡片。

**在 `baseURL` 是 Moonshot 主机时大声失败。** 否决：用户已经把该 URL 存在已发布卡片上，并要求当前工具同时支持这两种服务。更清晰的错误仍然会让搜索不可用。

## Consequences

已发布的搜索卡片可以指向 DeepSeek Anthropic 基址或 Moonshot 专用搜索 URL，而无需更换提供方 id。自定义代理只要保留 `/anthropic` 或以 `/search` 结尾即可继续工作。若某个 Moonshot 主机日后提供 Anthropic Messages 搜索路径，只要该路径包含 `/anthropic`，就仍走 DeepSeek Messages。以后仍可再增加真正的第二个可选提供方；此次适配不会发明第二个面向模型的工具。

## Testing

`packages/web/web-search-deepseek/tests/endpoint.spec.ts` 固定主机、路径、`/anthropic` 覆盖，以及无法解析时的回退。`tests/moonshot.spec.ts` 固定请求映射（URL 按原样、`text_query`、无 Messages 日志、无 Anthropic 标头）、响应映射、`limit` 截断，以及 Moonshot 的错误／取消分类。`tests/redirect.spec.ts` 证明 Moonshot 路径同样拒绝跟随 `Location`。既有 DeepSeek Messages 测试继续覆盖 `/messages` 约定。

## Related

- [Web 能力 seam](../architecture/2026-06-24-web-capability-seam.md) — 提供方注册能力；`dsh-tool-web` 拥有稳定的 `web_search` schema。
- [Web 默认搜索](2026-07-31-web-default-search.md) — 已发布组合仍将 `searchProvider` 固定为 `deepseek-official`。

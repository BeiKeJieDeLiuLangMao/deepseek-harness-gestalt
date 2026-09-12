# Agent Note: Settings Remote 的 web-search 探测

Status: implemented

[English](2026-09-05-settings-web-search-probe.md) | 中文

## 问题

Host 配置页需要在不打开 Session 的情况下探测当前选中的 web-search backend。该调用只存在于临时 ApiProxy 的 `settings.testWebSearch`。settings controller 已经拥有生成的 `settings` Remote namespace，若不把同一方法迁过去，删除 ApiProxy 就会丢掉这一 Host 行为。

## 决策

`SettingsController.testWebSearch` 是现有 `settings` namespace 上的 `@Remote` 方法。它通过 `ctx.get('web')` 读取可选的 `ctx.web` capability，把调用方 AbortSignal 转进 `web.search`，并从第一条 source 返回 `{ count, title?, url? }`。省略 query 时使用 `deepseek harness`。缺少 web capability 或 provider 抛错为 `gateway/internal`；中止为 `gateway/cancelled`。该方法不打开 Session，也不新增平行 HTTP 路由。

## 曾考虑的替代方案

**把探测留在 ApiProxy 直到整包删除。** 拒绝，因为配置页已经消费生成的 settings namespace；把探测留在后面会使删除 ApiProxy 丢掉现存 Host 行为。

**新增 `web` Remote namespace。** 拒绝，因为调用方是配置页探测当前选中的 backend，而不是通用 web-search Remote。现有 settings namespace 才是所有者。

**把 `@deepseek-ai/dsh-web` 做成必需 Host 值导入。** 拒绝，因为 web seam 在装配时是可选的。controller 收窄 `ctx.get('web')`，并把缺失报告为具名配置错误。

## 后果

挂载 `dsh-web` 的部署在 `ctx.remote.settings.testWebSearch` 上保留无 Session 的 search 探测。省略该 seam 的部署在调用时闭口失败。ApiProxy 在后续票据删除该包之前仍保留旧方法。

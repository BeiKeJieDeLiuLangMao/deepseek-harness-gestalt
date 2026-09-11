# Agent Note: Client catalog 可达性、重述 toolSearch 与生成 Remote 类型

Status: implemented

[English](2026-09-11-ci-catalog-toolsearch-pins.md) | 中文

## Problem

locale 与 header pin 落地后，0.1.5 合入的 coverage 与 snapshots 仍失败。公开 Client 入口未导入 Cordis augmentation，Client catalog 看不到 `ctx.betterSidebar`。重述 `tools` 行的 snapshot overlay 丢掉了 base `toolSearch`，延迟加载的 `browser_create` 拒绝注册。generated-host oxlint 工程导入 `@deepseek-ai/dsh-*/remote`，该路径指向 coverage 不会构建的未发布 `lib/` 产物。SDK wire golden 仍携带 `memberQuestionEvents`，进程外 DSH SDK 工具被钉上了它们并不广告的 `images`。

## Decision

从公开 Client 入口再导出 `BetterSidebarService`，让 Typert Client catalog 发现到达 `src/client/context.ts`。替换 `tools` config 的 snapshot 与 profile patch 在 `mode` 旁重述 `toolSearch.maxResultBytes: 65536`。generated-host spec 导入已提交的 `tests/typert.remote-client.d.ts`（生成 Remote merge 的副本），oxlint typed project 引用 Gateway Client face。SDK `result.expected.json` 与 `normalizeResult` 对齐（仅 `sessionId` 与 `finalResponse`）。只给进程内 `subagent` / `subagent_fork` 钉 `images`；进程外具名工具省略它。PTC schema pin 跟随 live header（仅 `run_code`）。Issue-management HTTP 测试钉死 `GITHUB_REPOSITORY`，避免 Gestalt CI 改写期望 API 路径。Node 无法按工作区包名解析的 snapshot 插件改导入该包 `src/` 入口。inspect catalog fixture 跟随 live `ToolRuntime` 方法（`presentAs` 返回 Promise disposer；`allowEligible` / `eligibilityAllow` / `catalogSchemas` 为公开方法）。PTC TypeScript 与 Python system-prompt sidecar 声明延迟加载的 `tool_search`。`pnpm run gen-config-catalog` 是 `docs/config-catalog.md` 的来源；中文对侧跟随该生成清单。

## Alternatives considered

**只把 `betterSidebar` 留在 `SidebarContext` 的结构类型上，Host 不可见。** 否决：Client catalog 测试要求 Cordis augmentation，发现路径走公开 Client export。

**在 snapshot overlay 里禁用 `tool-browser`，而不是重述 `toolSearch`。** 否决：Browser 工具仍是 headless/SDK 组合的一部分；overlay 必须让延迟注册合法。

**在 `tsconfig.base.json` 把 `@deepseek-ai/dsh-*/remote` 映射到源码。** 否决：生成 Remote dts 没有源文件；Host 生成器在 coverage 不会跑的 build 之后才写入 `lib/`。

## Consequences

catalog 测试断言的 Client Cordis augmentation 必须能从公开 `./client` export 到达。任何重述 `tools` 行的 patch，只要仍挂载延迟工具，就必须重述 `toolSearch`。generated-host oxlint 工程在干净树上即可类型检查，不必先跑 `pnpm run build`。

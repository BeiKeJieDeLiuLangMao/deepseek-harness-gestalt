# Agent Note: First-run official DeepSeek listing

Status: implemented

[English](2026-08-20-first-run-official-deepseek-listing.md) | 中文

## Problem

整分节提供方（`settingsPath: []`）只有在用户 settings 层被占用或某个 `role('secret')` slot 已设置时才算 `configured`。官方 DeepSeek 的 `apiKeyEnv` 是 credential-ref，不是 secret slot。全新首次运行时两个条件都为假，因此只绘制 `configured` 行的列表既没有官方行，也没有设置卡片，用户没有路径输入 API 密钥。

只要适配器已挂载就始终列出官方 DeepSeek，会推翻已交付的删除规则：用户清空官方分节后，该行必须离开列表，且不得再出现在「添加提供方」下。

## Decision

`configured` 仍只看占用或 secret slot。首次运行渲染是另一条列表谓词 `listedProviderRows`。

整分节官方行在占用或联接报告 `credential.configured === true` 时出现在列表中。取消设置分节根会留下 `user: {}`，这是删除残余；没有已存凭据时不出现在列表中。首次运行不再列出从未写入的官方行；该翻转见 [首次运行不预置官方 DeepSeek](2026-08-22-first-run-does-not-mint-official-deepseek.zh.md)。

只有在已列出的官方行还没有存储凭据、且联接中没有其他行可以提供服务时，才提供设置卡片。删除会在页面重新联接之前把 `settings.mutate` 的应答折进共享 describe mirror，因为 `ensure` 不会对已经 ready 的 mirror 再读一次。

删除官方 DeepSeek 时，先清除其配置所引用的可写凭据，再取消整个用户分节。凭据删除被拒绝时保留设置；后续步骤失败时仍可重试。环境持有的凭据保持只读。添加提供方仍提供 catalog DeepSeek 路由，共享其凭据不会占用官方行。

直连适配器把同一持久删除标记应用于路由。从未写入的用户分节会保留 `deepseek-official`，供首次运行配置凭据。非空用户分节或已配置凭据会占用该路由。显式空用户分节且没有已配置凭据时，会原子撤出适配器路由，同时保留可配置提供方目录条目。settings 文档与凭据引用提交会触发此判定；异步凭据描述带代次栅栏，描述失败时保留上一拓扑。

## Alternatives considered

**把整分节解析值上的 credential-ref 当作 `configured`。** 否决：schema 默认值在删除后仍指名 `DEEPSEEK_API_KEY`，官方行将永远不会离开列表。

**只要官方 DeepSeek 已挂载就始终列出。** 否决：那会在删除后把该行找回来，即使另一个提供方已经可用；它也不会出现在「添加提供方」下。

**把残留的 `user: {}` 当作首次运行。** 否决：那正是取消设置分节根写出的残余，也是删除用来隐藏该行的信号。

## Consequences

删除且没有已存凭据后，官方 DeepSeek 在同一会话内也不出现在列表中。联接对从未写入的分节和残留空对象都仍报告 `configured: false`。

Session 模型目录不再公布已删除的 DeepSeek 模型。已有的持久选择与新 Session 的默认值保持不变，以原始 `provider/model` 回退显示，并报告为不可路由，直到用户配置提供方。

## Testing

`packages/client/ui-settings-models/tests/store.client.spec.ts` 钉住空用户层且 `secrets` 为空时未配置，同时仍联接 `DEEPSEEK_API_KEY`，并钉住在下一次联接前把 mutate 应答折进 describe mirror。`packages/client/ui-settings-models/tests/components.client.spec.tsx` 钉住残留 `{}` 不出现在列表中，以及删除后同一访问内该行消失。`packages/llm/llm-deepseek/tests/dynamic-config.spec.ts` 通过真实 settings 与凭据提供方覆盖路由撤出、仅凭据恢复及过期异步描述。`packages/client/ui-model-selection/tests/browser-plugin.client.spec.ts` 与 `apps/web/tests/onboarding-deepseek-config.e2e.ts` 覆盖删除后已有与新 Session 的选择器。

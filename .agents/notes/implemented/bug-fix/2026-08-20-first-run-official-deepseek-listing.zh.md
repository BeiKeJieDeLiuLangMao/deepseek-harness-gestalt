# Agent Note: First-run official DeepSeek listing

Status: implemented

[English](2026-08-20-first-run-official-deepseek-listing.md) | 中文

## Problem

整分节提供方（`settingsPath: []`）只有在用户 settings 层被占用或某个 `role('secret')` slot 已设置时才算 `configured`。官方 DeepSeek 的 `apiKeyEnv` 是 credential-ref，不是 secret slot。全新首次运行时两个条件都为假，因此只绘制 `configured` 行的列表既没有官方行，也没有设置卡片，用户没有路径输入 API 密钥。

只要适配器已挂载就始终列出官方 DeepSeek，会推翻已交付的删除规则：用户清空官方分节后，该行必须离开列表，且不得再出现在「添加提供方」下。

## Decision

`configured` 仍只看占用或 secret slot。首次运行渲染是另一条列表谓词 `listedProviderRows`。

只有在联接中没有其他行可以提供服务、且官方 namespace 没有 `user` 属性时，才提供设置卡片。该缺失属性表示分节从未被写入。取消设置分节根会留下 `user: {}`，这是删除残余，不出现在列表中。关闭设置卡片仍通过 `dismissedSetup` 在本会话内保留该行。仍被占用的官方 DeepSeek 仍是普通行。

凭据引导弹窗保持未注册。Models 设置卡片是首次运行的密钥入口。

## Alternatives considered

**把整分节解析值上的 credential-ref 当作 `configured`。** 否决：schema 默认值在删除后仍指名 `DEEPSEEK_API_KEY`，官方行将永远不会离开列表。

**只要官方 DeepSeek 已挂载就始终列出。** 否决：那会在删除后把该行找回来，即使另一个提供方已经可用；它也不会出现在「添加提供方」下。

**把残留的 `user: {}` 当作首次运行。** 否决：那正是取消设置分节根写出的残余，也是删除用来隐藏该行的信号。

## Consequences

没有可用提供方的首次运行用户仍能在 Models 上到达官方密钥字段。删除后，无论是否另有可用提供方，官方 DeepSeek 都不出现在列表中。联接对从未写入的分节和残留空对象都仍报告 `configured: false`。

## Testing

`packages/client/ui-settings-models/tests/store.client.spec.ts` 钉住空用户层且 `secrets` 为空时未配置，同时仍联接 `DEEPSEEK_API_KEY`。`packages/client/ui-settings-models/tests/components.client.spec.tsx` 钉住 `listedProviderRows` 对从未写入的首次运行、残留 `{}`、另一可用提供方和 `dismissedSetup` 的结果，以及对应的挂载设置卡片与删除后列表。无密钥的 `apps/web/tests/onboarding-deepseek-config.e2e.ts` 与 `apps/web/tests/onboarding-usable-provider.e2e.ts` 泳道通过该设置卡片输入密钥。

# Agent Note: Gestalt fallback brand

Status: implemented

[English](2026-08-21-gestalt-fallback-brand.md) | 中文

## 问题

未设置 `DSH_CLIENT_TITLE`、且没有占位者占据 `sidebar.brand.name` 的源码或未签名 Web 构建，会在文档标题和侧栏品牌回退上显示 **DSH Local Build**。那是检出形态的名字，不是本产品的名字。

## 决策

未设置标题时的回退，以及品牌名 slot 无人占位时的侧栏文案，都是 **DSH Gestalt**。`apps/web/index.html` 与 Vite 改写 `<title>` 所用的针使用同一字符串，源码启动与带标题的构建保持对齐。设置了 `DSH_CLIENT_TITLE` 的构建仍然胜出。已加载 `ui-brand-official` 时，官方 wordmark 仍占据品牌 slot。

## 考虑过的替代方案

**源码启动继续用 DSH Local Build。** 否决，因为用户实际看到的 Web chrome 是本产品名，不是检出种类。

**只改侧栏回退，不动文档标题。** 否决，因为这两处共享同一「未设置标题」含义；拆开会让标签页标题和品牌行不一致。

**把官方 wordmark 铭牌改成 GESTALT。** 此处否决。那是另一个 slot 的占位者。本笔记只拥有占位者缺席时的回退。

## 后果

未定义标题的本地 `pnpm dsh web` 会在标签页显示 DSH Gestalt；品牌插件未占据名称 slot 时，侧栏也显示它。已经设置产品标题的 Desktop 安装包不变。

## 测试

`packages/client/ui-renderer/tests/document-title.client.spec.tsx` 固定未设置标题时的回退。`packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx` 与侧栏快照固定无人占位的名称。`apps/web/tests/built-boot.snapshot.ts` 仍断言官方 wordmark 占据名称，因此回退字符串不出现。

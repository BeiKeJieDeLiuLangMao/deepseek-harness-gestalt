# Agent Note: cliproxy-quota library kind 与 package README 骨架 pin

Status: implemented

[English](2026-09-12-package-readme-kind-skeleton.md) | 中文

## Problem

仅补 Summary 的 README pin 之后，required `node 24 / static` 仍失败。`packages/llm/cliproxy-quota/README.md` 缺少 YAML frontmatter、`Table of Contents` 与 `Dev Note`。`packages/llm/llm-gestalt-account-pool` 同样缺少该骨架。cliproxy-quota 是纯模块 library，因此 `expectedKind()` 要求 `package-library`，并需要 `PACKAGE_LIBRARIES` 登记。

## Decision

cliproxy-quota 使用 `kind: package-library`，并列入 `PACKAGE_LIBRARIES`。account-pool 插件使用 `kind: package-reference`。两对中英文 README 保留既有约定，并补上门禁要求的 Summary/概述、Table of Contents/目录、Dev Note/开发备注 标题。cliproxy-quota 继续省略 Model Experience（`NO_MODEL_EXPERIENCE_SECTION`）；account-pool 适配器保留结构化 Model Experience。

## Alternatives considered

**把 cliproxy-quota 当作 `package-reference`。** 否决：`src/index.ts` 导出 `createQuotaObserver` 与类型，没有 `apply` 或默认 service，kind 门禁将其归为 library。

**中文标题继续使用英文 `## Summary`。** 否决：结构门禁要求 `.zh.md` 使用 `## 概述`、`## 目录` 与 `开发备注`。

## Consequences

新增 `packages/*/*/README.md` 必须在同一变更中带上 frontmatter `kind` 以及 Summary/Contents/Dev Note 骨架。纯模块 library 还要加入 `scripts/doc-standard.spec.ts` 的 `PACKAGE_LIBRARIES`。

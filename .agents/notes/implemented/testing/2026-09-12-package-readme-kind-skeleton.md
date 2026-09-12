# Agent Note: cliproxy-quota library kind and package README skeleton pins

Status: implemented

English | [中文](2026-09-12-package-readme-kind-skeleton.zh.md)

## Problem

Required `node 24 / static` failed after the Summary-only README pins. `packages/llm/cliproxy-quota/README.md` still lacked YAML frontmatter, `Table of Contents`, and `Dev Note`. The same skeleton was missing on `packages/llm/llm-gestalt-account-pool`. cliproxy-quota is a plain-module library, so `expectedKind()` required `package-library` and a `PACKAGE_LIBRARIES` registry entry.

## Decision

cliproxy-quota carries `kind: package-library` and is listed in `PACKAGE_LIBRARIES`. The account-pool plugin carries `kind: package-reference`. Both English/Chinese README pairs keep their existing contracts and add the gated Summary/概述, Table of Contents/目录, and Dev Note/开发备注 headings. Model Experience stays omitted on cliproxy-quota (`NO_MODEL_EXPERIENCE_SECTION`) and structured on the account-pool adapter.

## Alternatives considered

**Treat cliproxy-quota as `package-reference`.** Rejected: `src/index.ts` exports `createQuotaObserver` and types with no `apply` or default service, so the kind gate classifies it as a library.

**Leave the Chinese headings in English `## Summary`.** Rejected: the structure gate requires `## 概述`, `## 目录`, and `开发备注` on `.zh.md` files.

## Consequences

A new `packages/*/*/README.md` must ship frontmatter `kind` plus the Summary/Contents/Dev Note skeleton in the same change that adds the package. A plain-module library also joins `PACKAGE_LIBRARIES` in `scripts/doc-standard.spec.ts`.

# Agent Note: Operated Platform 启动器分类

Status: implemented

[English](2026-09-08-operated-platform-launcher-classification.md) | 中文

## Problem

Profile 应用需要统一的生命周期与自定义配置所有者。Operated Platform 后端则负责生产身份校验，以及共享 PostgreSQL 和 Redis 资源的事务式获取。把已接受的基础设施可执行文件当成未分类的 profile 应用，会使启动器检查与部署组合不一致。

## Decision

[单一 dsh 应用启动器](2026-08-22-single-dsh-application-launcher.zh.md) 负责 Agent、SDK、ACP 与 Web profile 应用。Operated 后端保留 `apps/platform/package.json` 中将 `dsh-platform` 映射到 `./dist/boot.mjs` 的精确 bin 声明。入口自有组合、生产身份校验、资源获取与清理仍由 [operated Companion 身份](2026-08-22-operated-companion-platform-identity.zh.md) 约束。此分类不授予其他包应用 bin。

[应用入口检查](../../../../scripts/verify-application-entrypoints.ts) 也按精确源码路径与职责分类现有 Desktop 构建、发行和测试可执行文件。新文件、Platform bin 名称或目标变化，以及额外入口均无法通过检查。根应用 demo 仍须选择 dsh CLI。

本记录部分取代单一启动器记录覆盖所有 Node 入口的范围。原记录保留 profile 组合、SDK 自定义、打包与关闭的理由；operated 身份记录保留独立的生产信任及资源义务。两者均继续保持活跃。

## Alternatives considered

**删除 operated Platform 可执行文件，或强制经 Agent profile 启动。** 拒绝，因为已接受的生产基础设施组合在用户 Agent 自定义之外独立拥有共享存储与身份。启动器分类不授权改变该所有权。

**允许所有应用 bin 或所有 Desktop 可执行文件。** 拒绝，因为目录级豁免会在没有明确职责或所有权决定的情况下接纳新启动器。

## Consequences

检查接受已维护的后端与工具清单，同时拒绝未分类的新启动路径。Focused fixture 固定 Platform 精确映射、拒绝新 Desktop 脚本，以及继续拒绝直接启动包的 demo。生产 boot、launch 和 Docker 源码保留既有行为与产品入口验证；分类本身不是部署证据。

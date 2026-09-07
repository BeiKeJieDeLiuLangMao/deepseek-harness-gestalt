# Agent Note：合并后 workspace compiler face 完整性

Status: implemented

[English](2026-09-04-merged-workspace-compiler-faces.md) | 中文

## 问题

机械式上游合并可能保留有效的 package manifest，却遗漏对应的 lockfile importer 或根 TypeScript Project Reference。此时安装树可能继续使用陈旧链接，direct aggregate program 也会产生缺失源码诊断，掩盖后续 ticket 所有的 API 迁移错误。

## 决策

Lockfile 从完整 pnpm workspace 生成，包含 pnpm 发现的全部 306 个 workspace project。干净安装只选择当前 host 可执行的 binary payload；跨平台 packaging 仍在隔离树中负责覆盖 `supportedArchitectures`。

每个保留的 Gestalt Host 或 Client project 都有显式根 aggregate reference。仓库自有 discovery pattern 独立于 `GESTALT_COMPILER_FACES` 对保留下游 compiler project 分类；workspace constraints 会拒绝显式 inventory 或匹配 aggregate 中缺失的 project。Split project 仍必须引用匹配的 leaf config；因此 Better Sidebar Client project 引用 `client/connection/tsconfig.client.json`，而不是其 solution root。同一个已执行 constraint 通过 TypeScript AST 发现所有以静态方式直接导入 `./scaffold.ts` 的现有顶层 Web test，要求其精确路径同时出现在 Web project exclude 与根 Host include 中，拒绝任一清单中失效的精确 Web test 文件条目，并在 discovery 没有得到任何 consumer 时失败。

Client-only Cordis `Context` augmentation 只能从公开 Client 入口到达。共享快照类型使用包内专用名称，不再导出另一个 `Context`，因此 Typert 可以独立索引 Host 与 Client compiler face，而不会把 Host service signature 解析为 Client 结构镜像。Cordis catalog partition 仍会扫描每个 augmentation，并要求每个 Host 已渲染或显式归为 Client-only 的 service 具有唯一 owner。

保留的 release package manifest 使用合并仓库版本，并保留 package 专属 publication files。Desktop、Mobile 与 Platform application 仍是私有 product assembly，不属于 npm release family。

## 考虑过的替代方案

**使用 aggregate-wide source include。** 这会绕过 package compiler ownership、混合无关 source root，并隐藏缺失 Project Reference，而不是修复它。

**根据目录名或 manifest export 推导全部 compiler face。** Runtime entry point 不能决定 TypeScript environment：保留的 Platform client package 位于 `packages/client` 之外，而部分 package 暴露 browser subpath 却不属于 Client aggregate。显式下游清单让特殊 membership 保持可审查。

**在普通 checkout 下载所有平台 binary。** 这会扩大安装体积，并让干净 setup 依赖当前 host 无法执行的 binary。Packaging lane 已负责跨平台 materialization。

## 后果

Frozen clean install 会从生成的 lockfile 重新链接 Zod 与全部 workspace dependency。Direct Host 与 Client aggregate program 不再报告由 compiler face 缺失导致的 `TS6307` source-missing diagnostic；剩余失败属于后续 API 与迁移工作。

显式 Gestalt compiler-face inventory 与独立 discovery classification 都是持续维护义务。新增或移除保留下游 project 时，必须同步更新 discovery pattern、aggregate 与 inventory；focused regression test 会从两个声明清单同时移除一个 project，并仍然观察到遗漏。静态导入 Host scaffold 的 Web test 由 discovery 发现，而不是人工抽样；因此新增、移除或重命名这类 test 时，必须保持 Web exclude 与 Host include 同步。

Host catalog 会省略 Client-only service，而 Client Typert discovery 仍可解析其 declaration。Client augmentation 若变得可从 Host 到达，或快照镜像以通用 `Context` 名称导出，face-specific catalog regression 会失败，而不是由 runtime exclusion 隐藏。

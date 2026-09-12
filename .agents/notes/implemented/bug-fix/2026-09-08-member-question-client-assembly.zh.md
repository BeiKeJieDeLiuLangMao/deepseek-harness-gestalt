# Agent Note：发行版成员提问 Client 装配

Status: implemented

[English](2026-09-08-member-question-client-assembly.md) | 中文

## 问题

`ui-member-questions` 是唯一读取 receiving-question 投影并注册叠加式 Decision Brief dock 的 Client 插件。Client 模块注册表从活跃 Loader 行中发现包；包的 `dsh.client` 声明会排列已发现的依赖，但不会激活包。如果发行版 roster 缺少 `ui-member-questions` 行，Host receiver 与 receiving Session 投影仍可存在，而产品 UI 不会提供回答或拒绝控件。

## 决策

Web 应用 roster 在 `ui-user-questions` 之后把 `@deepseek-ai/dsh-client-ui-member-questions` 显式挂载为 `ui-member-questions`，Web 应用 manifest 也把该包声明为 resolver 依赖。Desktop 先继承 Web base 中的该行，再应用 Desktop patch。

装配 guard 分别检查四项事实：Web 默认配置包含该行，解析后的 Desktop 配置保留该行，随发行版交付的 Host 产生包含该包的 Client 模块图，真实浏览器 boot manifest 包含已激活的该包。这些检查防止用源码包、manifest 依赖或 Host receiver 替代实际 Client 激活。

## 已考虑的替代方案

**根据 `dsh.client` 依赖推断 Client 激活。** 否决，因为 Loader 行是部署显式选择的插件集合。依赖元数据只排列并校验该集合已经选中的包。

**通过 `ui-user-questions` 渲染成员提问。** 否决，因为该插件拥有本地模型向用户发起的问题。成员提问 dock 消费 Host receiving authority、终态结果与 receiver 所有的材料路径。

## 后果

当 Host receiving 投影包含 pending 成员提问时，正常 Web 与 Desktop 组合会激活现有 Decision Brief dock 及其回答与拒绝控件。此装配决策不会增加生产跨账号投递实现；投递可用性仍由 sender 与 receiver 能力拥有。

## 测试

`apps/desktop/tests/overlay-isolation.spec.ts` 检查 Web 默认配置与解析后的 Desktop 配置。`apps/web/tests/shipped-composition.e2e.ts` 检查最终 Host Client 模块图。`apps/web/tests/smoke-real.e2e.ts` 启动真实 Web 入口、等待该包 bundle，并检查浏览器 boot manifest。现有 `apps/web/tests/member-question-receiving.e2e.ts` 与 ui-member-questions 包测试继续拥有接收交互本身。

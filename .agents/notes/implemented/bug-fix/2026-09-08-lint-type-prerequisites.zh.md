# Agent Note：lint 的类型前置条件

Status: implemented

[English](2026-09-08-lint-type-prerequisites.md) | 中文

## 问题

当导入的声明不可用，或可运行示例没有可发现的 TypeScript 项目时，类型感知 lint 会连续报告不安全操作。这些诊断不能证明源码使用了无类型 API。只构建 Host 会使跨 face 组装测试无法获取 Client transport 声明。

## 决策

公共 lint 与修复命令先构建 Host 库，再构建 Client 库，之后调用内部 lint 命令。内部命令消费这些已准备的声明。Remote Protocol 示例拥有一个不发射产物的 TypeScript 项目，以入口为唯一根文件，直接引用 Cordis 和 protocol 包。无程序根 solution 与独立 aggregate 程序保留各自职责。

[Oxlint 发现决策](../process/2026-07-29-oxlint-linter.zh.md) 仍具有权威性：最近的 TypeScript 项目决定类型感知发现，CLI tsconfig 覆盖参数只改变 import 解析。[编译 face 决策](../process/2026-09-04-merged-workspace-compiler-faces.zh.md) 继续负责跨 face 测试归属和声明消费。

## 验证

可执行 lint 测试要求两个公共命令准备两侧库，检查真实示例不存在不安全类型诊断，并用 TS2345 拒绝传给协议数字版本列表参数的字符串。独立负例复用示例配置和引用，不修改可运行源码。

## 考虑过的替代方案

**在每个导入调用处抑制不安全诊断。** 这会掩盖类型信息缺失，允许错误使用本来有类型的 API。

**传入 CLI tsconfig 覆盖参数，或向 solution 添加根文件。** 覆盖参数不决定类型感知发现。给 solution 添加根文件会混合由独立 aggregate 保持分离的编译职责。

## 影响

公共类型感知 lint 包含 Client 构建准备。无项目的 staged lint 路径仍不依赖构建产物。示例项目根文件与包引用是明确的维护职责。满足声明的类型前置条件后，真实源码规则诊断仍需处理。

---
description: "可运行示例包，供读者选择组装进程路径，以便在包内测试之外演练 DeepSeek Harness 能力。"
kind: "package-group"
---

# examples/ — 可运行的组装应用示例

[English](README.md) | 中文

## 概述

这些包为组装后的 DeepSeek Harness 示例提供可运行入口。使用这些入口可以通过已发布产物执行具体的 Cordis 组合并检查其进程输出。每个包各自负责一条可执行路径；能力包负责该路径所组装的运行时行为。仓库 `examples/` 下的叶配置选择具体组合。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

该组提供一条手机画面采集链路的进程入口。

| 包 | 角色 |
|---|---|
| [`phone-capture-wire-demo/`](phone-capture-wire-demo/README.zh.md) | 通过已发布的 bin 启动外部 Cordis 配置，并输出无密钥 Android capture-source Host transcript（文本记录） |

<a id="related-documentation"></a>
## 相关文档

- [手机运行时子系统](../../docs/subsystems/phone-runtime.zh.md) — 定义该示例使用的设备群运行时、画面采集流与所有权。

<a id="dev-note"></a>
## 开发备注

无。

---
description: "供 Agent preset 声明基础工具资格的 allow-only 配置。"
kind: "package-reference"
---

# dsh-agent-tool-eligibility

[English](README.md) | 中文

## 概述

agent preset 用来声明基础工具资格的 allow-only 配置行。

```yaml
- id: tool-eligibility
  name: '@deepseek-ai/dsh-agent-tool-eligibility'
  config:
    allow: [bash, str_replace_editor]
```

`allow` 必填且是唯一配置字段。该行把名称贡献到 preset 的常驻作用域；Workspace 与 Session 设置随后可通过 [`dsh-tools-eligibility`](../tools-eligibility/README.zh.md) 添加名称。空列表表示该 preset 不允许任何末端工具。名称可以指向稍后注册的工具，因此动态注册无需重新挂载 preset。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### Preset 许可

#### 模型看到什么

只有 preset 许可或更具体的 Workspace 与 Session 添加项中点名的工具 schema 才会通过 [`dsh-tools`](../tools/README.zh.md) 进入请求。空 preset 许可不贡献任何 schema，直到更具体的设置添加工具。

#### Token 影响

该行不添加 prompt 文本。它会从该 preset 的 Session 中移除每个不具资格的工具 schema 及其每次请求重复的 token 成本。

#### KV Cache 影响

许可在 preset 组合时固定。资格 schema 集合的变化会从首个变化的工具 schema 起使请求前缀失效。

## 已知限制与暂缓事项
<a id="known-limitations-and-deferred-work"></a>

- 该行只接受精确工具 id；不提供别名、模式、分类或 deny 列表。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>

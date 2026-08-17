# Agent Note：Allow-only 工具资格

Status: implemented

[English](2026-08-18-allow-only-tool-eligibility.md) | 中文

## 问题

agent preset 可以组合工具目录，但用户还需要 Workspace 与 Session 专属的添加项。既有 `ctx.tools.restrict()` 原语同时接受 allow 与 deny 筛选，服务于受信任的内部组合。把它直接投影到用户 settings 会产生两套策略词汇，使后续注册在 allow 与 deny 下表现不同，并违背产品的正向配置要求。

资格还必须在模型组装和执行间保持为同一个事实。只筛选请求 schema 会让过期或伪造调用仍可执行；只筛选分发则会向模型宣告它无法使用的工具。只持久化配置名称也不足以回放，因为动态注册决定某次请求当时存在哪些 schema。

## 决策

`dsh-tools` 按作用域持有正向资格贡献。preset 到 Agent 的作用域链上的贡献取并集。没有贡献时保留既有的不受限目录；已声明且并集为空的作用域链不允许任何末端工具。一旦启用，同一份解析视图会为 `schemas()`、`get()` 和 `execute()` 筛选继承与作用域本地定义。声明时不校验名称，因此 preset 或 setting 可以早于动态工具注册。内部 allow/deny `restrict()` 接口继续供受信插件使用，不进入用户配置。

`dsh-agent-tool-eligibility` 是 preset 配置行，只公开一个必填 `allow` 列表。`dsh-tools-eligibility` 注册 allow-only 的 `tool-eligibility` settings 分节，其中含 `workspaces` 与 `sessions` 两张映射。它为每个实时 Agent 先贡献匹配的 Workspace 列表，再贡献匹配的 Session 列表；两者都是在 preset 基础上的正向添加，实时 settings 变化会替换该贡献，无需重启 Session。Workspace 匹配先找到规范路径等于 `session.header.cwd` 的 Workspace，再使用其稳定 id。

解析后的工具视图是唯一运行时事实。Agent loop 从中取得请求 schema，分发也在进入工具主体前从中解析被调用定义。`session.toolEligibility` 向 Host 客户端返回同一份正向并集与当前 schema。现有持久 `request/header` 事件会记录每次组装请求的全部工具，因此仍可重建精确的模型可见 schema。不会新增资格事件：单独记录当前 settings 只会复制策略输入，却不能证明当时哪些动态定义进入了请求。

Code Mode 保留 `run_code` 作为呈现基础设施。正向资格筛选其 SDK 使用的末端工具定义；该传输不是一项可单独配置的能力。

## 验证

工具注册表测试覆盖作用域链并集、显式 allow-none、继承与作用域本地 schema 筛选、过期调用拒绝和工具主体未执行。解析器测试覆盖 preset、Workspace 与 Session 添加、动态注册、实时 settings 更新和用户配置中不存在 deny 字段。API 测试覆盖 `session.toolEligibility`。Web minimal-preset 无密钥回放会挂载 allow-only preset，在持久请求 header 中只记录 `bash`，执行该工具，并证明过期 `str_replace_editor` 调用在执行前失败。

## 曾考虑的替代方案

**把 `restrict()` 公开为 settings。** 否决，因为 deny 是内部组合机制，而已接受的用户配置只允许正向表达。

**把资格编译为每个 Agent 的内部 restriction。** 否决，因为内部 restriction 有意豁免 delegation 机制使用的作用域本地注册。资格必须判断每个模型可见的末端工具，包括直接注册在 Agent 自身作用域的定义。

**新增持久资格事件。** 否决，因为 `request/header.tools` 已记录精确的模型可见结果。settings 事件记录的只是输入，可能与请求时的动态目录不一致，并会形成第二个重建来源。

## 后果

preset 作者和用户只配置增量 allow 列表，而模型、Host API 与执行器共用同一目录。未声明资格的既有组合保持不受限。最终并集为空时会有意移除所有末端工具；拼错或当前不存在的名称不会授予任何内容，直到精确同名工具注册。settings 文档按稳定 id 组织条目，因此通用 settings 编辑器需要这些 id；未来更丰富的 Workspace 与 Session 交互仍可写入同一 namespace，无需改变策略模型。

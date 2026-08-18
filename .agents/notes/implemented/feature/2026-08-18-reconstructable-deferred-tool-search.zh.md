# Agent Note：可重建的 deferred 工具搜索

Status: implemented

[English](2026-08-18-reconstructable-deferred-tool-search.md) | 中文

## 问题

大型动态工具目录会在模型知道自己需要哪项能力之前就消耗请求 token。省略 schema 可以降低成本，但仅存在于执行过程中的搜索结果会让下一次请求依赖临时注册表状态，并在 Session 恢复后失效。把搜索视为激活还会在 `dsh-tools` 解析的 allow-only 资格之外，制造第二份可见注册表状态。

## 决策

`ToolDefinition.deferLoading` 标记不会进入初始请求的已注册定义。随仓交付的 base bundle 启用 `dsh-tools.toolSearch`，由它贡献保留的 `tool_search` 基础设施 schema。搜索索引根据调用 Agent 当前解析后的视图重新构建，只包含合资格的 deferred 定义。其规范结果是精确匹配的 `ToolSchema[]`；它绝不会注册、启用或以其他方式激活工具。模型生成的搜索输入会在建立索引前验证：`query` 必须包含非空白文本，`limit` 必须是配置上限范围内的整数。

agent loop 会把匹配 schema 存到持久 `tool-result` 块。每次提示词组装都会从 `Session.deriveMessages()` 读取这些结果，按工具名称去重，并且仅当当前解析视图仍包含同名、合资格的 deferred 定义时才保留已存 schema。因此下一次请求携带搜索实际返回的精确 schema；工具移除或更窄的 allow-only 贡献会阻止旧历史恢复或分发它。`request/header` 继续记录完整的已组装请求工具，使回放只有一份权威请求快照。

`schemas()` 表示初始模型请求，会省略 deferred 定义。`catalogSchemas()` 表示 Host 与检查接口使用的当前完整合资格末端工具目录。MCP 实例通过 `deferLoading` 按服务器选择加入；发现期间，其完整实时世代始终保持注册；如果 `toolSearch` 已禁用，客户端会在连接前拒绝该配置。Code Mode 会把嵌套 `tool_search` 子分发得到的 schema 带到外层 `run_code` 结果，并让生成的 SDK 与下一次程序的实际 binding 使用同一份重建后且当前合资格的集合。

发现元数据只描述最终提交给模型可见的成功结果。post-execute 或 around-execute 替换、阻止、错误，以及定义自有的内容替换，都会清除该执行的候选 `loadedTools`；策略结果不能保留来自更早主体结果、且其值或内容已被替换的 schema。

provider-neutral 适配器收到普通 `tool_search` 调用、其 JSON schema 结果和扩展后的下一次请求工具列表。pi-ai 桥还会把持久结果映射为 `addedToolNames`；支持原生工具搜索的 OpenAI Responses 模型会收到等价的 `tool_search_call` 与 `tool_search_output` 历史，其中 schema 带 `defer_loading`。两条路径都从同一份 provider-neutral Session 日志派生。

## 验证

注册表测试证明输入边界验证、配置结果上限、初始省略、合资格目录保留、精确 schema 结果、最终结果元数据、持久的下一次请求与恢复重建、Code Mode binding 执行，以及 allow-only 资格变化后的拒绝。MCP 生命周期测试证明按服务器延迟加载和发现配置错误会明确失败。pi-ai 测试证明 provider-neutral 元数据转换与原生 OpenAI Responses 请求载荷。无密钥 headless 快照通过真实 Loader 启动随仓交付的 Agent 主干，发现并调用官方 MCP 服务器的 deferred `echo` 工具，持久化规范 JSONL，释放 Loader 树，再重新加载同一 Session 并验证重建后的请求 header。

## 曾考虑的替代方案

**改变每个 Agent 的活动工具集合。** 否决，因为发现是返回给模型的证据，不是授权或注册状态变化。可变活动集合会重复资格，并要求一套新的持久状态机。

**搜索后从当前注册表重新计算匹配 schema。** 否决，因为搜索与续轮之间的 schema 变化会使请求不同于模型读到的结果。日志存储实际返回的 schema，只使用当前注册表重新检查持续资格。

**只持久化匹配名称。** 否决，因为名称无法重建精确的模型可见 schema，还会使恢复依赖 provider 的当前输出。

## 后果

部署可以让大型 MCP 世代保持注册且可执行，同时不承担完整的初始 schema 成本。搜索结果会把 schema JSON 加入历史并改变后续请求工具，因此发现仍有 token 成本。模型如果猜到一个已注册且合资格的名称，可以不经搜索直接调用它；这是有意行为，因为搜索不会激活工具。资格仍是发现与分发的唯一权威。

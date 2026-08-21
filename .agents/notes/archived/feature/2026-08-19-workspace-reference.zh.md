# Agent Note: 第一方工作区引用

Status: implemented
Archived: 2026-08-20

[English](2026-08-19-workspace-reference.md) | 中文

## Problem

Web composer 没有第一方途径让用户指向一条工作区路径，并使模型把该路径当作经过校验的显式引用。用户只能凭记忆键入或粘贴路径。最接近的已交付能力在做别的事：[行内代码文件提及](../feature/2026-08-07-web-inline-file-mentions.md) 打开的是 assistant 已经产出的文件；[图片附件](../feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md) 持久化的是光栅字节而不是路径；[会话引用](../feature/2026-07-21-cross-session-references.md) 快照的是另一段对话；`AGENTS.md` 里的 `@path` import 被有意保持不解释。

社区插件 [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 已经在 Web 上补了这个缺口。它是非官方的树外组合包，不是 `vendor/` 候选，并且偏离第一方惯例（裸 `node:fs`、自定义 `at-file-mention` 来源、未 scoped 的包名、提交 `lib/`）。第一方的扫描、排序、忽略列表和约束含有源自 dsh-at-file 0.6.3（MIT）的部分；每个包在 `NOTICE` 中保留该版权声明。

## Decision

**工作区引用（Workspace Reference）** 是 shipped web profile 上的第一方默认能力。它是用户书写的指针，指向当前会话工作区内一条真实存在的路径。它给出工作区相对路径，以及该路径是文件还是目录。它不是文件字节，也不是目录的子项。领域用语见 [`packages/context/CONTEXT.md`](../../../../packages/context/CONTEXT.md)。

模型可见载荷是一条带 source 的 `user/message`，正文为：

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

`@deepseek-ai/dsh-workspace-reference` 在 `agent/pre-step` 用 `ctx.fs` 校验 token。它拒绝工作区越界：绝对路径、Windows 盘符相对路径 token（`C:foo`）、`path.relative` 结果离开 cwd、中间段 symlink 的 realpath 离开 cwd，以及末段 symlink。`foo..bar.ts` 这类基名不是越界的 `..` 段。不为这条标记读取文件内容或列出目录子项。无法解析的 token 保持普通散文。紧跟在单词字符之后的 `@` 不是路径 token（`user@host.com`）。

Web 的 `@` 触发器保持共享。`@deepseek-ai/dsh-client-ui-workspace-reference` 通过 [`ctx.inputTriggers`](../architecture/2026-07-25-web-input-machine-and-slash-pipeline.md) 注册名为 `workspace` 的 `InputTriggerSource`。选中一项会插入以文件名为标签的 `ReferenceInsert` chip。提交和剪贴板经 source codec 展开为 `@rel/path`（目录保留尾斜杠），因此 Host pre-step 仍能看到该 token。在高亮目录上按 ArrowRight 会插入 `@path/` 并保持菜单打开。开启粘贴忽略时，粘贴的 `@` 会带上 U+2060，Host 扫描器会跳过它们；手打且存在的路径仍会变成标记。设置提供启用、粘贴忽略和 Exact/Regex 文件名过滤；文案不出现 “File mentions”。浏览器对 `workspaceReference.search` 返回的会话索引做本地排序，最多展示 `menuLimit` 行（默认 12）。Host 遍历用分层 `listDir`，并跳过内置忽略目录名和目录 `FS_PERMISSION_DENIED`。

Markdown 形式的会话引用 `@[label](dsh-session:…)` 绝不是工作区引用。扫描器匹配的是紧前面不是单词字符的 `@`，然后是 `[^\s@[\]]+`。持久化 source 是 `{ kind: 'workspace-reference', path, pathKind }`，登记在 [docs/subsystems/workspace-reference.md](../../../../docs/subsystems/workspace-reference.md)。transcript 来源信息用该路径做行标签。

web-app bundle 挂载这两个包。图片拖放仍是附件。第一方不检测也不拒绝社区插件；两者同时加载时会出现两组 `@` 路径候选。

## Deferred

文件名 chip、粘贴忽略、文件夹进入和设置的产品可见 Web GIF，由交付流程在合并前从本票的 pull request 运行时录制，并附到该 PR。

## Alternatives considered

- **把 dsh-at-file vendor 进 `vendor/`。** Vendoring 钉的是 Cordis 框架层。这个插件是必须过第一方门禁、使用 `ctx.fs`、并以 scoped 工作区包交付的 DSH 产品能力。

- **依赖 GitHub tarball 或未来的 npm 发布。** 该包未发布、单人维护，并且 peer 锁在 DSH 内部 API 上。

- **原样拷进 `packages/`。** 未 scoped 的包名、提交 `lib/`、自定义 esbuild、裸 `node:fs` 和自定义消息 source 都不符合第一方布局。

- **提交时注入文件字节或目录列表。** dsh-at-file 已经从该设计撤退。已归档的 TUI `@path` 功能拒绝过同一想法。

- **只有 picker、没有 Host 标记。** 手打 `@src/foo.ts` 和回放会丢掉经过校验的引用。

- **一个双入口包，或完整 capability seam。** 双入口包会把 Node 索引绑到 React。seam 需要第二个 Service Provider；目前没有。

- **`{ kind: 'plugin' }` source，或新的会话事件。** 生产者身份是路径，不是 plugin id。

- **第一期扫描每个 Host 的用户文本。** 社区产品只覆盖 Web。

- **复用 source 名 `at-file` 来互斥社区插件。** 第一方标识符不应编码非官方包名。

- **在 composer 里继续显示 `@path`。** chip 是 UI 投影；serialize 仍发出 `@path` 供 Host 扫描。刷新后草稿恢复为剪贴板形式。

## Consequences

用户若继续安装社区插件，会看到两组 `@` 路径候选，直到自行移除。私有索引遍历仍可能在 `maxIndexedFiles` 之后漏路径，并可能与 `gitignore` 不一致。有人会期望 `@` 或拖放文件变成附件字节；标记正文和现有的不支持拖放路径避免它悄悄变成内容注入。

headless Loader 组合钉住带 source 的标记。无密钥 Web snapshot 钉住 `@` picker 菜单、文件名 chip 插入、粘贴忽略、文件夹进入和设置分区。

## Testing

- Host 扫描、排序、索引和浏览器 source 的包级单测覆盖。
- `packages/context/workspace-reference/tests/workspace-reference.e2e.ts` 通过真实 Loader 组合发送 `@README.md` 并断言带 source 的标记。
- `apps/web/tests/workspace-reference-picker.e2e.ts` 在键入已播种基名后快照 Workspace `@` 菜单，断言选中后插入文件名 chip（`U+FFFC` 加 label）且 serialize/剪贴板形式为 `@rel/path`，并快照粘贴忽略、文件夹进入和设置分区。

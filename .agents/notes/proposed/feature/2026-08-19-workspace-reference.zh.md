# Agent Note: 第一方工作区引用

Status: proposed

[English](2026-08-19-workspace-reference.md) | 中文

## Problem

Web composer 没有第一方途径让用户指向一条工作区路径，并使模型把该路径当作经过校验的显式引用。用户只能凭记忆键入或粘贴路径。最接近的已交付能力在做别的事：[行内代码文件提及](../../implemented/feature/2026-08-07-web-inline-file-mentions.md) 打开的是 assistant 已经产出的文件；[图片附件](../../implemented/feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md) 持久化的是光栅字节而不是路径；[会话引用](../../implemented/feature/2026-07-21-cross-session-references.md) 快照的是另一段对话；`AGENTS.md` 里的 `@path` import 被有意保持不解释。

社区插件 [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) 已经在 Web 上补了这个缺口：键入 `@` 搜索工作区、插入 `@rel/path`，并在步骤开始前注入一条仅表示存在性的标记。它是非官方的树外组合包，不是 `vendor/` 候选，并且偏离第一方惯例（裸 `node:fs`、自定义 `at-file-mention` 来源、未 scoped 的包名、提交 `lib/`）。把它当作钉死副本或 npm 依赖吸收，会把这些偏离一并带进来。从零重做产品则会丢掉一套用户已经习惯的 token 语法、排序、粘贴保护和 ignore 表。

## Proposal

把**工作区引用（Workspace Reference）**作为第一方默认能力送进 web profile。工作区引用是用户书写的指针，指向当前会话工作区内一条真实存在的路径。它给出工作区相对路径，以及该路径是文件还是目录。它不是文件字节，也不是目录的子项。领域用语见 [`packages/context/CONTEXT.md`](../../../../packages/context/CONTEXT.md)。

模型可见载荷是一条带 source 的 `user/message`，正文为：

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

Host 用 `ctx.fs.lstat` 确认存在性，拒绝逃出工作区和末段 symlink，并且不为这条标记读取文件内容或列出目录子项。任务需要查看时，agent 使用会话里已有的工具检查该路径。无法解析的 token 保持普通散文。这与已删除 TUI `@path` 功能在[其归档 Note](../../archived/feature/2026-07-23-tui-file-reference-autocomplete.md) 中记录的「只保留路径」立场相同，也与 dsh-at-file 自 0.3.0 起放弃提交时注入内容之后的立场相同。

用户可见的 Web 行为对齐 dsh-at-file 0.6.3：`@` picker、ArrowRight 进入目录、composer dock、默认忽略粘贴的 `@` token、内置忽略目录名、Exact/Regex 基名过滤，以及手打且能在工作区内解析的 `@path`。架构不对齐：第一方包替换该插件的接线。

## Product contract

Web 的 `@` 触发器保持共享。第一方 `InputTriggerSource` 名为 `workspace`，不叫 `at-file`。它通过 [`ctx.inputTriggers`](../../implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md) 与 `subagent` 以及可选的 cordis catalog 一起注册。选中一项会插入纯文本 `@rel/path`（目录保留尾斜杠）外加一个尾随空格。草稿中的 chip 仍是 lexicon 装饰；提交不使用 U+FFFC `ReferenceInsert` 序列化。

Host 扫描器在第一期只挂在 web profile 上。它扫描 `source.kind === 'user'` 的文本。Markdown 形式的会话引用 `@[label](dsh-session:…)` 绝不是工作区引用。只有裸 `@[^\s@[\]]+` token 才是候选，并且必须经 `lstat` 证明该路径存在于 `session.header.cwd` 内。

持久化 source 是专用的 `MessageSourceMap` kind `{ kind: 'workspace-reference', … }`，携带相对路径和 `file` / `directory`。它不是 `{ kind: 'plugin', plugin: '…' }`，也不是新的会话事件类型。transcript 来源信息可以像会话引用或 skill 调用那样点名这条路径。

设置文案不得写 “File mentions”。社区插件的设置命名空间和 Typert 命名空间不得进入第一方标识符。

## Absorption

把 dsh-at-file 当作规格和一组已测纯函数，而不是当作可 vendor 或可依赖的仓库。[Vendoring](../../implemented/process/2026-06-11-vendor-cordis-as-source.md) 钉的是 Cordis 框架层。[优先使用依赖](../../implemented/process/2026-07-26-dependencies-over-hand-rolling.md) 要求一个能删掉自有代码的、仍在维护的包；这个插件是非官方、单人维护的组合包，peer 锁在未发布的 DSH 内部 API 上，并且没有发布到 npm。

在 MIT 署名下移植：token 扫描与去重、文件名和路径段排序、内置忽略目录名、Exact/Regex 基名规则、粘贴 word-joiner 保护、XML 属性转义，以及拒绝逃出工作区。重写 host `apply`、Typert 注册、设置、客户端插件和索引遍历。存在性与列举走 `ctx.fs`（`lstat`、分层 `listDir`）。不要给文件系统 seam 增加递归索引原语。单个目录的 `EPERM` 跳过该目录；不得中止整次索引（dsh-at-file issue #19）。

## Package cut

两个包，不是完整能力 seam，也不是一个双入口插件：

- `@deepseek-ai/dsh-workspace-reference` 位于 `packages/context/workspace-reference`，负责扫描、校验、注入、私有索引遍历、Typert 搜索／设置 remote，以及设置。
- `@deepseek-ai/dsh-client-ui-workspace-reference` 位于 `packages/client/ui-workspace-reference`，负责 picker、dock、文件夹导航、设置区块和 locale。

web-app 组合包挂载二者。第一期其他 profile 不挂 pre-step listener。当前只有一个 Web 消费方和一次本地 walk；没有第二个 Index Provider 的证据。

## Coexistence

图片拖放和粘贴仍是附件。把 PDF 拖进 composer 仍是不受支持的附件，不是工作区引用。第一期不把文件拖放变成路径指针。

已经安装社区插件的用户在移除之前仍保留该组合包。第一方注册不使用 source 名 `at-file`，因此 `registerSource` 不会碰撞。两者同时加载会出现两份 picker；升级说明要求用户执行 `dsh plugin --profile web remove dsh-at-file`。第一方代码不检测、不拒绝社区包。

`AGENTS.md` 里的 `@path` import 保持不解释。扫描器从不读取 instruction 文件。

## Alternatives considered

- **把 dsh-at-file vendor 进 `vendor/`。** Vendoring 是钉死的 Cordis 框架层。这个插件是 DSH 产品功能，必须通过第一方门禁、使用 `ctx.fs`，并以 scoped 的 workspace 包交付。

- **依赖 GitHub tarball 或未来的 npm 发布。** 该包未发布、单人维护，并且 peer 锁在 DSH 内部 API 上。版本错位会变成坏掉的 picker，而不是删掉一块自有实现。

- **把该仓库原样拷进 `packages/`。** 未 scoped 的包名、提交的 `lib/`、自研 esbuild、裸 `node:fs`、自定义消息来源，以及 `ctx.reflect.get('remote.atFile')` 变通，都过不了第一方布局、覆盖率和 Loader 组合规则。

- **在提交时注入文件字节或目录清单。** dsh-at-file 已经从该设计退回。它会绕开 `read` / `read_image`、沙箱观察和字节预算，并把 PDF 与二进制放进提示词。已归档的 TUI `@path` 功能否决过同一想法。

- **只做 picker，Host 不打标记。** 手打的 `@src/foo.ts` 和回放会丢掉经过校验的引用。没有 Host 检查加上粘贴忽略，就无法区分粘贴来的诱饵 `@path` 和一次真实手势。

- **一个双入口包，或完整能力 seam。** 双入口包会把 Node 索引绑在 React 上。seam 需要第二个 Service Provider；现在没有。

- **`{ kind: 'plugin' }` source，或新的会话事件。** 插件 id 不是生产者身份；路径才是。这条标记是又一条带 source 的 `user/message`，与 skill 调用和会话引用相同。

- **第一期扫描每个 host 的用户文本。** 社区产品只覆盖 Web。扫描 ACP 或 SDK 文本会把碰巧叫作工作区文件名的 `@token` 变成引用。

- **复用 source 名 `at-file` 来互斥社区插件。** 谁后加载谁赢。第一方标识符不应编码非官方包名。

- **第一期就用结构化 `ReferenceInsert` chip。** 输入状态机当前交付的路径是纯文本 `@path`。该插件插入的也是同一字面量。chip 序列化是独立的 `@` 消费变更。

## Acceptance criteria

- 已交付的 web profile：键入 `@` 会列出工作区文件和目录；选中一项插入 `@rel/path`；dock 可以打开或移除它；ArrowRight 进入目录；Settings 提供启用、粘贴忽略和 Exact/Regex 过滤，且文案不含 “File mentions”。
- 含有经过校验的 `@path` 的已提交提示词会记录一条 `user/message`，其 source kind 为 `workspace-reference`，正文仅为 `<workspace-reference>` 标记。该消息和模型请求中都没有文件字节，也没有目录子项。
- 缺失路径、绝对路径、逃出工作区，以及末段 symlink 保持散文。Markdown `@[label](dsh-session:…)` 仍是会话引用候选，绝不是工作区引用。
- 开启粘贴忽略时，粘贴的 `@path` 不生成标记。手打且存在于工作区内的路径仍然生成。
- `ctx.fs.lstat` / 分层 `listDir` 是唯一的文件系统入口。目录 `EPERM` 会省略该目录并继续。
- 无密钥 Web snapshot 钉住 picker、dock、粘贴忽略和模型可见标记。Loader REAL-composition 测试挂载 web 行。包测试覆盖扫描语法、排序、忽略规则和围栏。
- 中英文包 README、`context-provenance` 标签，以及请求上下文术语表与此名称保持一致。

## Risks

在移除社区插件之前，用户会看到两组 `@` 路径。缓解手段是升级说明；运行时互斥不是。

若扫描器把 `@[label](uri)` 当成路径，会破坏日后 Web 会话引用的落地，并且现在就能弄乱粘贴进来的会话提及文本。

私有索引遍历仍可能在 `maxIndexedFiles` 之外漏掉路径，并且仍可能与 `gitignore` 不一致。这些限制继承自社区产品，并保持文档化。

有些用户会期望 `@` 或拖入文件会附上字节，尤其是 PDF。标记正文和现有的不受支持拖放路径必须阻止该期望在沉默中变成内容注入。

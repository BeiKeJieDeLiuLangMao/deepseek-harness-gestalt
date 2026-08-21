# Agent Note: Repair File/Session Reference CI reds

Status: implemented

[English](2026-08-21-file-session-ci-reds.md) | 中文

## Problem

File/Session Reference 同步到官方 Host `@path` / `file-reference-local` 与 `session-reference` 之后，Gestalt `#204` 上仍有四条合并阻塞红灯。Linux coverage 里 pwsh backend 把回显的 `PWSH_PROMPT_SETUP` 源码当成已安装的 `dsh> ` 提示符，于是 `tool-pwsh-persistent` 抽不到命令标记；同一用例里 relay 的 oversized 帧在 10 ms first-frame 期限下以 `1008` 而不是 `1009` 关闭。consumers 车道上 publint 拒绝 `remote-access-client` 的 hashed chunk，Web 设置金标仍列出已删除的工作区引用导航，Composer 图片标注 e2e 打开预览后没有 `Annotate image`。把 persistent-pwsh 快照刷成截断的 bootstrap，或把 hashed chunk 加进 `files` 白名单，都会把这些失败藏起来。

## Decision

**pwsh 要等这条 send 打出已安装提示符才 settle。** Linux pwsh 会在默认提示符、命令还没跑时就报告 `inputWaiting`，setup 回显的前几个字节也算输出。把这两者当就绪，视口就停在残留 setup 或 `PS …>`，后面的 `keep=` / `cwd=` 提取会失败；下一次 send 还会把另一段 setup 叠到仍在安装的会话上。完全关掉这条等待会饿死 spawn：OSC+tail 从不出现，`inferred_idle` 也抢不过横幅输出，shell 打到 `timeoutMs` 或在启动时退出。因此 pwsh 的 `acceptsStdinWait`、OSC `stdin_read` 和 `inferred_idle` 都只在当前 send 的最新非空白行是 `CONTROLLED_PROMPT`（`dsh> `）或工具层 `__DSH_PERSISTENT_PWSH_PROMPT__ ` 后 settle。setup 只提交一次。剥掉 setup 源码后再 `includes()` 仍会接受 `setup-echo dsh> `；真实提示符还没打出时，每次 follow-up `startSend` 会重置自己的期限，于是 `inferred_idle` 饿死 `timeout`。现在由 spawn 的 `timeoutMs` 约束整个循环。ACP 与 loader 组合把 `idleSilenceMs`（以及会话交接处的 `handoffGraceMs`）加长，避免横幅到提示符的静默抢先结束。[persistent pwsh 笔记](../architecture/2026-08-11-pwsh-persistent-pty.md) 仍拥有双层 prompt 安装。

**Relay 的载荷尺寸检查使用默认 first-frame 期限。** 空闲超时断言仍启动 10 ms 服务器。oversized 帧断言另启默认 1000 ms 的服务器，避免 attach-timeout 抢在 1009 关闭之前。

**`remote-access-client` 每个 entry 只发出一个文件。** 每个已发布文件各自一个 tsdown face，并设置 `outputOptions.codeSplitting: false`，与 compaction 和 JSON-RPC demo 一致。多 entry face 不能关闭 splitting。包的 `files` 白名单与 `packageFileExtras` 不变。

**设置金标去掉已删除的工作区引用行。** `ui-workspace-reference` 删除后导航不再有该项；期望树不再包含 `工作区引用`。

**Composer 预览恢复官方 pin overlay，InputBar 保留 Gestalt 注释计数。** `InputBar` 通过 `pinOverlayFor` 传入 `useComposerImagePinOverlay`。`ComposerAttachments` 自管 pin-mode，仅在用户对 `image/gif` 切换标注时设置 `annotation.gifRefuse`。打开预览本身不显示该警告。历史 pin 保持 `source: 'history'`；Composer pin 使用默认 `composer` source。两个 overlay hook 共用 `useImagePinOverlay`，避免 jscpd 把 Composer 恢复当成 history hook 的克隆。整份取官方 `InputBar` 丢掉了 Web e2e 依赖的 `{count} annotation` 摘要与丢弃控件；计数芯片、逐条编辑/删除，以及仅有注释时启用发送，仍留在 composer 卡片上。父会话离线的 continuable 子会话在独立 Stop 旁边保留禁用的 Send。空草稿插话会等到 textarea 可见且不在 `submitting`/`adjudicating`，再等单条入队行文本出现；若提问 composer 藏掉残留的 `plain` 节点，第二条入队改为强制填充。

## Alternatives considered

**把 `persistent-pwsh-tool-turn` 刷新成截断的 bootstrap 转录。** 否决：那是把假就绪失败记成成功。工具仍须在真正的第二次 prompt 安装之后抽出 `PWSH_OK`。

**把 hashed `lib/relay-*.js` 名字加进 `files`。** 否决：`check-workspace-constraints` 生成期望文件列表。拆出 chunk 是发出缺陷，不是打包例外。

**在三 entry 的 browser face 上设置 `codeSplitting: false`。** 否决：tsdown 在关闭 splitting 时拒绝多个 input。每个已发布文件各自一个 face。

**让 first-frame 与载荷尺寸共用一台 10 ms 服务器。** 否决：覆盖率分区负载下 attach 期限会先到，并以 1008 关闭。

**保留工作区引用金标行，只在用例之间关掉设置对话框。** 否决：产品导航已没有该行。共享 page 被 overlay 挡住是第一条金标过期的症状。

**一打开预览就显示 GIF 拒绝警告。** 否决：拒绝发生在切换标注时。PNG 预览不得带警告。

**给镜像的 pin hook 包 `jscpd:ignore`。** 否决：overlay 构造就是一个函数。忽略注释会把真克隆藏起来。

## Consequences

官方 File/Session Reference 仍是唯一的 `@` 文件源。负载下的 persistent pwsh 等末行已安装提示符，而不是子串回显；卡住的横幅循环在 `timeoutMs` 失败，而不是挂住 coverage worker。Relay、publint、设置金标、Composer pin e2e 与注释计数芯片走修复后的路径。已删除的工作区引用 picker 金标保持删除。

## Testing

`packages/terminal/terminal-bash/tests/session.spec.ts` 保证 pwsh 的 stdin-wait 和 inferred idle 不会在命令回显、setup 源码或默认 `PS>` 行上 settle，并接受工具层提示符为已安装。`packages/terminal/terminal-bash/tests/index.spec.ts` 拒绝只是包含提示符标记的末行，忽略末尾只含空格的光标行，把 `stdin_read` 当作 spawn 就绪，在 send 视口仍停在 setup 回显时接受 scrollback 里的提示符，在 follow-up 视口为空时也只提交一次 setup，并用 `timeoutMs` 约束永不就绪的空闲循环。`packages/client/ui-attachment/tests/message-image.client.spec.tsx` 覆盖历史 pin overlay、拒绝与落点。空草稿插话等单条入队行文本——计数头只在两条及以上才出现——若提问 composer 抢先藏掉节点则强制填充第二条入队。`packages/platform/remote-access-http/tests/relay.spec.ts` 仍在独立服务器上分别以 1008 关闭空闲、以 1009 关闭 oversized。`packages/client/ui-attachment/tests/composer-attachments.client.spec.tsx` 与 `packages/client/ui-conversation/tests/composer-image-pins.client.spec.tsx` 覆盖标注、GIF 仅在切换时拒绝，以及 composer overlay 工厂。`pnpm run duplication` 拥有共享的 `useImagePinOverlay` 抽取。`packages/client/ui-conversation/tests/input-bar.client.spec.tsx` 覆盖注释计数芯片、丢弃、按 kind 删除与提交中锁定。Web 设置金标不再列出 `工作区引用`。`pnpm exec tsx scripts/gen-client-catalog.ts --check` 拥有 `ComposerAttachmentsOwnerProps.pinOverlayFor` 的目录正文。

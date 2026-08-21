# Agent Note: Repair File/Session Reference CI reds

Status: implemented

[English](2026-08-21-file-session-ci-reds.md) | 中文

## Problem

File/Session Reference 同步到官方 Host `@path` / `file-reference-local` 与 `session-reference` 之后，Gestalt `#204` 上仍有四条合并阻塞红灯。Linux coverage 里 pwsh backend 把回显的 `PWSH_PROMPT_SETUP` 源码当成已安装的 `dsh> ` 提示符，于是 `tool-pwsh-persistent` 抽不到命令标记；同一用例里 relay 的 oversized 帧在 10 ms first-frame 期限下以 `1008` 而不是 `1009` 关闭。consumers 车道上 publint 拒绝 `remote-access-client` 的 hashed chunk，Web 设置金标仍列出已删除的工作区引用导航，Composer 图片标注 e2e 打开预览后没有 `Annotate image`。把 persistent-pwsh 快照刷成截断的 bootstrap，或把 hashed chunk 加进 `files` 白名单，都会把这些失败藏起来。

## Decision

**pwsh 在 argv 上安装提示符；命令 idle 要等输出之后的提示符。** 交互式 setup send 在 Linux 上会竞态：默认提示符就报告 `inputWaiting`，setup 回显算输出，`PS …>` 会在行跑完前重打。因此方言默认 argv 是 `-NoLogo -NoProfile -NoExit -Command` 加上编码钉和 `prompt` 函数，spawn 与 bash 一样做空的 `initialize()` 等待。pwsh 的 `acceptsStdinWait` 和 OSC `stdin_read` 仍只在当前 send 的最新非空白行是 `CONTROLLED_PROMPT`（`dsh> `）或工具层提示符后 settle。setup 类发送（持久化工具的第二次 prompt 安装）设置 `bootstrap: true`，让 `inferred_idle` 可以在任意输出上 settle。普通命令发送不设 `bootstrap`，只在提示符行加上至少一行非提示符之后才 idle settle。[persistent pwsh 笔记](../architecture/2026-08-11-pwsh-persistent-pty.md) 仍拥有双层 prompt 安装。

**Relay 的载荷尺寸检查使用默认 first-frame 期限。** 空闲超时断言仍启动 10 ms 服务器。oversized 帧断言另启默认 1000 ms 的服务器，避免 attach-timeout 抢在 1009 关闭之前。

**`remote-access-client` 每个 entry 只发出一个文件。** 每个已发布文件各自一个 tsdown face，并设置 `outputOptions.codeSplitting: false`，与 compaction 和 JSON-RPC demo 一致。多 entry face 不能关闭 splitting。包的 `files` 白名单与 `packageFileExtras` 不变。

**设置金标去掉已删除的工作区引用行。** `ui-workspace-reference` 删除后导航不再有该项；期望树不再包含 `工作区引用`。

**Composer 预览恢复官方 pin overlay，InputBar 保留 Gestalt 注释计数。** `InputBar` 通过 `pinOverlayFor` 传入 `useComposerImagePinOverlay`。`ComposerAttachments` 自管 pin-mode，仅在用户对 `image/gif` 切换标注时设置 `annotation.gifRefuse`。打开预览本身不显示该警告。历史 pin 保持 `source: 'history'`；Composer pin 使用默认 `composer` source。两个 overlay hook 共用 `useImagePinOverlay`，避免 jscpd 把 Composer 恢复当成 history hook 的克隆。整份取官方 `InputBar` 丢掉了 Web e2e 依赖的 `{count} annotation` 摘要与丢弃控件；计数芯片、逐条编辑/删除，以及仅有注释时启用发送，仍留在 composer 卡片上。父会话离线的 continuable 子会话在独立 Stop 旁边保留禁用的 Send。空草稿插话会等到 textarea 可见且不在 `submitting`/`adjudicating`，然后用 Playwright 的 `fill` 加 `Enter` 入队两行。

## Alternatives considered

**把 `persistent-pwsh-tool-turn` 刷新成截断的 bootstrap 转录。** 否决：那是把假就绪失败记成成功。工具仍须在真正的第二次 prompt 安装之后抽出 `PWSH_OK`。

**把 hashed `lib/relay-*.js` 名字加进 `files`。** 否决：`check-workspace-constraints` 生成期望文件列表。拆出 chunk 是发出缺陷，不是打包例外。

**在三 entry 的 browser face 上设置 `codeSplitting: false`。** 否决：tsdown 在关闭 splitting 时拒绝多个 input。每个已发布文件各自一个 face。

**让 first-frame 与载荷尺寸共用一台 10 ms 服务器。** 否决：覆盖率分区负载下 attach 期限会先到，并以 1008 关闭。

**保留工作区引用金标行，只在用例之间关掉设置对话框。** 否决：产品导航已没有该行。共享 page 被 overlay 挡住是第一条金标过期的症状。

**一打开预览就显示 GIF 拒绝警告。** 否决：拒绝发生在切换标注时。PNG 预览不得带警告。

**给镜像的 pin hook 包 `jscpd:ignore`。** 否决：overlay 构造就是一个函数。忽略注释会把真克隆藏起来。

## Consequences

官方 File/Session Reference 仍是唯一的 `@` 文件源。persistent pwsh 的 spawn 在 argv 上安装提示符并走 bash 的 `initialize()` 等待；普通命令 idle 等输出之后的提示符。Relay、publint、设置金标、Composer pin e2e 与注释计数芯片走修复后的路径。已删除的工作区引用 picker 金标保持删除。

## Testing

`packages/terminal/terminal-bash/tests/session.spec.ts` 保证 pwsh 的 stdin-wait 不会在命令回显上 settle，接受 `dsh> ` 或工具层提示符，让 inferred idle 在输出加提示符行后 settle，并拒绝单独的 `PS …>` 重打。`packages/terminal/terminal-bash/tests/index.spec.ts` 与 `config.spec.ts` 钉住 pwsh 默认 argv 为 `-NoExit -Command` 加上 prompt 函数，且 spawn 与 bash 一样走 `initialize()`。`packages/client/ui-attachment/tests/message-image.client.spec.tsx` 覆盖历史 pin overlay、拒绝与落点。空草稿插话等单条入队行文本——计数头只在两条及以上才出现——然后用 Playwright 的 `fill` 加 `Enter` 入队第二行。`packages/platform/remote-access-http/tests/relay.spec.ts` 仍在独立服务器上分别以 1008 关闭空闲、以 1009 关闭 oversized。`packages/client/ui-attachment/tests/composer-attachments.client.spec.tsx` 与 `packages/client/ui-conversation/tests/composer-image-pins.client.spec.tsx` 覆盖标注、GIF 仅在切换时拒绝，以及 composer overlay 工厂。`pnpm run duplication` 拥有共享的 `useImagePinOverlay` 抽取。`packages/client/ui-conversation/tests/input-bar.client.spec.tsx` 覆盖注释计数芯片、丢弃、按 kind 删除与提交中锁定。Web 设置金标不再列出 `工作区引用`。`pnpm exec tsx scripts/gen-client-catalog.ts --check` 拥有 `ComposerAttachmentsOwnerProps.pinOverlayFor` 的目录正文。

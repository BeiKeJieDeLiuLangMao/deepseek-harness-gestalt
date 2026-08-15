# Agent Note: Models 页的 `input` / `defaultInput` 标签

Status: implemented

[English](2026-08-16-models-page-input-modality-tags.md) | 中文

## Problem

手工声明的 pi-ai 模型在 profile 点名 `image` 之前一律按纯文本对待。适配器已经把该声明读成模型上的 `input` 和路由上的 `defaultInput`，`$DSH_HOME/settings.yaml` 也已经存这些数组。Models 页却不暴露这两个字段，因此给自定义视觉模型附加图片会在发送前失败，而唯一的纠正方式是一次 YAML 编辑——而这正是该页本来要避免的。

没有任何环节能询问端点接受哪些模态，因此页面无法从**获取可用模型**推断这份列表。一个标成「支持视觉」的开关也会给 settings 文件里已经有名字的字段再发明一种拼写。

## Decision

Models 页写入适配器已经在读的那份数组。

每个 pi-ai 模型行的展开区用「文本」和「图片」标签编辑该模型的 `input`。创建卡片和编辑卡片用同一组标签编辑路由的 `defaultInput`。可见文案按界面语言显示；写入值仍是 YAML 拼写，因此保存后的卡片与手工编辑的文件可以互换。两个都选则按该顺序存 `[text, image]`；只选一个就存那一项；一个都不选则省略该字段，而不是写入 `[]`，因为模型上的空列表已经表示「此处不作答」，路由上的空列表会在加载时被拒绝。

已经存下的未知项（未来的模态，或本卡片不提供的手写值）在切换时予以保留。DeepSeek 的目录仍是纯文本，不加标签：该适配器在线路上拒绝图片内容。

## Alternatives considered

**单独一个「支持图片」开关。** 更短，但表达不了 `input: [image]`，也表达不了「路由回退 `[text]`、某一个模型再选择图片」；还会把本卡片其余字段已经在用的 settings 文件名（`baseURL`、`api`）藏起来。

**给 profile 上每个数组做一份 schema 驱动的多选。** 同时会露出 `headers` 和 `reasoningEfforts`。那些仍归 YAML，因为添加视觉模型的人不需要它们，而页面已经拒绝过一份通用 schema 倾倒。

**从 `GET /models` 推断模态。** OpenAI 兼容列表不报告这些。把沉默当成视觉，会把图片发给随后拒绝它们的纯文本网关。

## Consequences

自定义视觉模型无需离开浏览器即可配置。目录提供方仍从已安装目录继承模态；`defaultInput` 仍只为目录未描述的模型作答。针对目录 id 的 `modelOverrides` 仍只能写 YAML，因为目录路由没有可挂按 id 标签的 `models` 列表。

## Testing

`packages/client/ui-settings-models/tests/input-modality.client.spec.ts` 钉住省略与空列表的区分、切换顺序，以及未知项的保留。`packages/client/ui-settings-models/tests/provider-form.client.spec.tsx` 经编辑卡片和创建卡片写入 `input: [text, image]` 与 `defaultInput: [image]`，省略被清空的模型列表，并在切换后保留已存的未知模态。

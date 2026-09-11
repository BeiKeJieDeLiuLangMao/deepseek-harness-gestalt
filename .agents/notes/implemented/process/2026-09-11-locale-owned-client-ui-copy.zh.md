# Agent Note: Phone 与 Desktop 账号池文案归 locale 所有

Status: implemented

[English](2026-09-11-locale-owned-client-ui-copy.md) | 中文

## 问题

`verify-client-ui-i18n` 属于 `check:ci:static`。0.1.5 合并带入的 Phone 标签/设置与 Desktop 账号池卡片，产品文案仍写在 TSX 和 helper map 里。静态 CI 报了 249 条硬编码字符串。覆盖率随后失败：六个事件签名类型（`AssistantStreamFrame`、`SessionSummary`、`GoalActivationChanged`、`PtcDispatchLog`、`ApprovalRequestEvent`、`AskUserQuestionRequestEvent`）未分类；这些事件失败还挡住了更大的服务方法 type-link 与分区缺口。快照钉仍描述旧的 subagent/`tool_search` header。

## 决策

把 Phone 与 Desktop 账号池产品文案迁入现有 locale 词典（`settings.phone-devices` 与 `desktop`）。组件从 slot locale 座位或 props 接收 `t`。协议、诊断、品牌和原生菜单字面量留在源码，并用 `@uiI18n` 标注。把六个事件类型以及原先被挡住的服务方法类型归入 `LINK_MAP` / foundation / exemptions，并把新可见的 Host 服务映射到 `SERVICE_PAGE` 与 `EVENT_SCOPE_PAGE`。钉住当前 writer 的工具 schema（进程内 subagent 工具的 `images`，以及 `tool_search`），并把 `member-question-routed-ask` 迁到 `session.v3.jsonl`。把本分支上已有的额外 `*.snapshot.ts` 文件记入 corpus 适配器清单。

## 考虑过的替代方案

**把 0.1.5 文案留在 TSX，放宽 i18n 门禁。** 否决：门禁存在的原因就是 Client UI 文案按语言只有一个所有者，Phone/账号池字符串是用户可见文案。

**把 Phone 与账号池从 i18n 豁免。** 否决：它们是普通 Client UI，不是协议或诊断文本。

**把 member-question 保留为 v0 历史迁移。** 否决：该场景是当前 writer 钉，不是已声明的历史迁移。

## 后果

切换界面语言时，Phone 与账号池 chrome 与其余 Desktop 设置走同一套词典。Catalog 生成会把新分类的类型写入子系统区域。快照 header 钉跟随现行工具列表；`member-question-routed-ask` 回放使用 Session 格式 v3。

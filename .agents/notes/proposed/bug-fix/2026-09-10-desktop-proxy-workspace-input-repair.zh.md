# Agent Note: Desktop 代理候选与 Workspace 输入反馈

Status: proposed

[English](2026-09-10-desktop-proxy-workspace-input-repair.md) | 中文

## Problem

Desktop GitHub 登录访问生产 Platform origin 时，Electron 依次返回 `SOCKS5`、`SOCKS` 和显式 `DIRECT`。Desktop 解析器在第一个不支持的指令上报错，没有到达显式路由，导致 Platform Account 登录在浏览器授权前停止。Workspace 设置还会把中文逗号当成同一职能标签的一部分，并把本地映射表遗漏的稳定 Project Membership failure 显示为通用错误。

代理修复必须保留主机网络策略。不支持的 carrier 不会授权隐式直连；后续的 `DIRECT`、`PROXY` 或 `HTTPS` 已经属于 Electron 选出的有序结果。Membership 诊断使用公开稳定 code，但服务端 message 和 IPC wrapper 不是用户文案。

## Proposal

Desktop 系统网络解析在同一份 Electron 有序结果中查找 `PROXY`、`HTTPS` 或显式 `DIRECT` 时跳过不支持的候选。非空结果若全部不受支持，仍然报错。空解析结果保留既有直连结果；格式错误或带凭证的受支持代理指令继续立即失败。实现不增加 SOCKS carrier，也不修改操作系统代理。

Workspace 设置用英文和中文逗号拆分职能标签，去除每个值两侧空白并丢弃空值，再调用既有 membership gateway。UI 为完整的 `ProjectMembershipErrorCode` union 提供简短的中英文文案，未知 failure 仍显示通用文案。Service 持有的数量、长度、唯一性、角色和对象存在性检查继续作为权威。

冻结的 UI 参考是 `005b49be715eb82826de65a06d1a9686c5577e39` 上的 `packages/client/ui-workspace/src/client/WorkspaceSettings.tsx`；本次修复只改变解析和反馈，不改变布局。体验路线是工作区行菜单 → 工作区设置 → 用 `triage，qa` 编辑一名成员的职能标签 → 按 Enter 或失焦，以及返回稳定 membership failure 的创建或成员操作。

## Alternatives considered

**没有受支持候选时回退直连。** 否决，因为不支持的 PAC 结果不代表可以绕过主机选择的代理策略。

**增加 SOCKS transport 支持。** 否决，因为观测到的结果已提供显式 `DIRECT`，新的 carrier dependency 和认证策略超出本次修复。

**显示服务端诊断。** 否决，因为 IPC wrapper 和服务端文本可能包含实现细节；稳定 error code 足以选择安全用户文案。

**在 client 重复 membership validation。** 否决，因为 Project Membership 持有标签和项目约束。Client 解析只负责分开输入值。

## Acceptance criteria

- `SOCKS5; SOCKS; DIRECT` 只产生显式直连候选；不支持指令后接 `PROXY` 或 `HTTPS` 时保留受支持候选及其顺序。
- 非空结果若只包含不支持的指令，会明确失败。无效或带凭证的受支持代理指令继续被拒绝。
- 生产 Desktop 登录不再停止在观测到的 `SOCKS5` 指令，并可通过显式 `DIRECT` 候选继续。
- 英文和中文逗号输入提交同一份去空、无空值的职能标签列表。
- 每个稳定 Project Membership error code 都映射到本地化安全文案；未知 failure 使用通用文案。
- 聚焦的 Desktop 网络和 Workspace 设置测试通过。产品路径登录和 Workspace 设置验收从集成后的规格 head 运行。

## Risks

跳过不支持的指令可能隐藏其 carrier 专属失败，因此后续没有受支持候选时，解析器必须保留可见错误。Error code 子串匹配必须优先识别完整稳定 code，避免误认其他 code。最终验收必须区分解析器成功与 OAuth 完成，也不得声称主机代理已改变。

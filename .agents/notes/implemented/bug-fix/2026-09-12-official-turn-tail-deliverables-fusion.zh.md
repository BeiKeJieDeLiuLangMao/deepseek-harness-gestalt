# Agent Note: 存在显式交付物时让渡官方 turn-tail 接管

状态: implemented

[English](2026-09-12-official-turn-tail-deliverables-fusion.md) | 中文

## 问题

在默认设置（`interceptOpenPath: true`）下，Better Sidebar 在 `registerOfficialTurnTail` 中以优先级 `priority: -1` 注册了贪婪的 `conversation.chat.turnTail` chain 处理器。只要轮次产生过文件，其 selector 即命中并渲染 `OfficialProducedFiles`。然而，`OfficialProducedFiles` 仅渲染产出文件标签行，不具备渲染显式交付卡片（`PresentedFileCard`）的能力。当一个轮次同时执行了文件变更并调用了 `present` 工具（例如生成 SVG 并完成交付）时，高优先级的接管完全遮蔽了官方 `ui-deliverables` 组件（`priority: 0`），导致对话流中的交付卡片、侧边栏预览按钮以及文件操作菜单全部丢失。

此外，在 `preview-boot.e2e.ts` 中，纯浏览器 worker 部署测试静态宿主上的启动期网络降级行为。融合引入的 `ui-phone` 和 `ui-better-sidebar` 对仅宿主端点（`/phone/environment` 与 `/sidebar/api/shell.get`）发起了合法探测并产生预期的静态 404，超出了测试原本允许的 404 白名单。

## 决策

1. 在 `packages/client/ui-better-sidebar/src/client/official-open-routing.tsx` 中，`registerOfficialTurnTail` 现通过 `hasPresentedDeliverables(owner)` 进行前置检查。若当前轮次包含显式交付物（`deliverables.presented`），接管让渡（返回 `null`），使官方 `ui-deliverables` 正常渲染产出文件行与全部交付文件卡片。
2. 在 `packages/client/ui-better-sidebar/tests/official-open-routing.client.spec.ts` 中补充负例测试，验证当存在交付物时 `definition.select(ownerWithPresented)` 返回 `null`。
3. 在 `apps/web/tests/preview-boot.e2e.ts` 中，将 `/phone/environment` 与 `/sidebar/api/shell.get` 纳入允许的静态 404 响应列表，并记录其在无宿主后台时的设计降级原因。
4. 使用 `DSH_SNAPSHOT=refresh` 重新生成 `snapshots/web/present-svg/session.v3.jsonl`，同步吸收上游 `subagent/model-selection-policy` 会话事件，同时完整保留既有的模型输出与 SVG 产物。

## 影响

- 在默认设置下，对话中的交付文件卡片完整可见且支持交互，无需在测试或实际使用中将 `interceptOpenPath` 设为 `false`。
- Preview boot 测试在静态宿主 404 探测得到明确解释与收敛后平稳通过。

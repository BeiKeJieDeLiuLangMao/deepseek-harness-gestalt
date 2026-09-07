# Agent Note: Session Schedule 当前状态任务板

Status: implemented

[English](2026-08-17-session-schedule-board.md) | 中文

## 问题

持久化的 Session-local 提醒此前只通过模型工具和后续对话输出存在。用户无法在其他 Session 活动旁查看保留的提醒，也无法在不删除并重建的情况下暂停提醒。渲染工具历史只会展示调用而不是当前状态，会遗漏可见 transcript 之外的变更，还会错误地把 fork 继承的前缀当作子 Session 的活动工作。

人工管理必须保留既有投递含义：普通 follow-up 仍是唯一的提醒输出，而任务板描述当前调度状态，不代表投递成功。暂停与恢复必须在重启后继续存在，并与到期 dispatch 串行化，不能只存在于浏览器内存。

## 决策

版本 1 的 `schedule/change` 增加严格且仅含 id 的 `pause` 与 `resume` 转换。pause 保留记录和目标，但将其排除在 runtime 投递之外；resume 使未变化的目标重新活跃，因此已经过去的目标会成为 overdue。delete 接受活动或已暂停记录。`schedule_list` 返回保留的已暂停记录，并使用 `state: 'paused'`；pause 与 resume 保持为仅供人工使用的 Remote 方法，不成为面向模型的工具。

`ctx.schedules` Service 拥有 `schedules/pause`、`schedules/resume` 与 `schedules/delete`。它们的 wire 标识是 branded `SessionId`，因此人工变更不会调用通用的 Agent-resume lookup。一条由 Service 拥有、按 Session 串行化的 FIFO 会把人工变更与工具管理和到期投递串行化；拆卸会关闭准入并等待已接纳事务，不同 Context 拥有不同队列。已存在的 live 根 Agent 使用普通的 preflight flush、append、post-append flush 和 runtime 重算。cold 变更会在整个事务期间持有独占 `SessionPersistence.open(id, 'write')` handle，并通过该 handle 读取、append 和 flush，既不 enter SessionStore，也不发布 Session 或 Agent 生命周期。关闭 handle 会释放持久化所有权，操作局部的 projection 状态不需要生命周期事件。如果写入所有权输给 Agent 发布，该事务会在同一 FIFO 内重新计算并使用该精确 live 根 Agent。Session 日志仍是唯一持久权威，因此暂停与恢复无需另一个存储即可在重启后保留。

Schedule 贡献独立的 Session projection，key 为 `schedule`，其中按创建顺序包含保留记录和持久化 `paused` 标志。`init` 保存 `Session.inheritedEventCount`；`apply` 会跳过 `seq` 小于该切点的 `schedule/change` 事件。Host 定义没有 `eventScope` 字段。Client 接收已完成的当前值，绝不折叠 Schedule 事件，也不从工具调用或对话输出重建状态。只有 Client 时钟根据 `scheduledAt` 推导 scheduled 或 overdue 展示。

Web app bundle 包含 A 版 Session 标题栏入口，顺序为 30，紧接在后台任务之后。它仅在 Host 挂载 Schedule Remote 贡献时激活，并在 projection 为空时保持缺席。触发器计数包含 scheduled 与 overdue 记录，并排除 paused 记录。任务板保持创建顺序，展示 scheduled、overdue 与 paused 行，并提供 pause、resume 与 delete。delete 需要行内二次确认。任务板没有创建表单；创建仍通过面向模型的 `schedule_create` 完成。

任务板不是投递回执。提醒的 assistant 输出仍只按照[对话式投递决策](../simplification/2026-08-09-conversational-schedule-delivery.zh.md)，作为普通后续对话轮次到达。任务板只说明 Schedule 当前保留什么、投递是否暂停，绝不说明模型回答是否成功或用户是否已读。它部分扩展了[持久 Schedule 决策](2026-08-05-durable-web-schedule.zh.md)，但不改变其 Session-local 投递边界。

## 考虑过的替代方案

**在 transcript 中渲染 Schedule 工具调用。** 调用是历史命令，而不是当前状态。它们会遗漏 runtime dispatch、Remote 变更、cold restore 和 projection 所有权，并会让继承的 fork 历史看起来仍然活跃。

**把 pause 保存在 Client 状态。** 仅浏览器内的标志会在 reload 时消失，与 live timer owner 竞争，并允许 UI 声称暂停时仍发生 dispatch。

**增加面向模型的 pause 与 resume 工具。** 这项控制是人工管理。增加工具会扩大模型行动权限和 schema，而可见的持久任务板并不需要它；模型仍可列出和删除提醒。

**增加浏览器创建表单。** 这会重复模型的自然语言解释与显式绝对时间输入面。首版任务板刻意只管理已有提醒。

**把任务板作为持久投递回执。** dispatch 记录队列准入，而非模型完成、显示或确认。回执需要单独的下游确认协议，并会违背普通对话式投递。

**复用后台任务 registry。** Job 是拥有不同重启、所有权、状态和输出语义的进程内执行记录。Schedule 是 Session 日志状态，必须在其 live timer 可丢弃时仍保持持久。

## 验证

Schedule domain、tools、runtime 与 restart 测试覆盖有效和无效 pause/resume 转换、删除 paused、列出 paused、runtime 排除暂停 overdue、持久化不确定性、JSONL remount 的 overdue 投递，以及 Include/Loader 的 create-pause-list-delete。事务测试证明按 Session 排序、独立 owner 隔离、关闭准入与完全停稳的 dispose。Schedule projection 测试会拒绝畸形变更、无效转换，以及解码记录不一致的检查点索引。插件生命周期覆盖证明 Schedule projection 贡献会随所属 fiber 一同离开。人工 Remote 传输与 Desktop 任务板仍是保留的设计义务，尚未挂载；Typert、Client 与 assembled Desktop 任务板场景不是当前 Host 证据。

## 后果

- 用户无需增加 scheduler 数据库或投递渠道，即可检查并持久暂停 Session-local 提醒。
- 人工与模型管理共享同一持久日志和串行化点，而 pause 与 resume 不会扩大模型行动权限。
- fork Session 保留继承的对话历史，但不会在其 projection 中继承活跃 Schedule 状态。
- Client bundle 增加一个 Schedule 专属当前状态 renderer 与 Remote 依赖；不带 Schedule namespace 的 Host 不会激活它。
- 恢复 overdue 提醒后，只要 live 根 Agent 重算，该提醒就可以按普通方式投递。
- 任务板刻意不能创建提醒，也不能声明模型完成、用户确认或外部通知。

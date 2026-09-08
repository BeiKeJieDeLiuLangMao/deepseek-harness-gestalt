# Agent Note: Ask-question Web 呈现

Status: implemented

[English](2026-07-29-ask-question-web-presentation.md) | 中文

## 问题

Web GUI 已经可以通过 `QuestionComposer` 的输入区接管收集回答，但其周边的会话记录呈现在三个方面是错的。待回答的问题会渲染两次：一次是输入区接管，一次是早于接管存在的只读 `PendingCard` 占位卡片。已结算的 `ask_user_question` 调用渲染为通用 "Tool call" 行并直接倾倒原始 args JSON，因此两种输入区裁决 —— 用户放弃整组问题（`ASK_CANCELLED`）与问题待回答期间轮次被打断（`ASK_ABORTED`）—— 都显示为无名的红点失败。而且输入区自身的界面文案（分页、按钮、占位符、校验反馈）是硬编码中文，而周边客户端已通过 `dsh-client-locale` 实现双语。

另外，输入区视觉也偏离了当前设计：自定义回答需展开才能输入、多选除尾部对勾外没有可见标识、分页挂在头部、还有从模型文本里解析 `（可多选）` 标题后缀的约定。

## 决定

一个待回答的问题恰好拥有两个界面：输入区接管收集回答，会话记录中一个专门的 `ask_user_question` toolview 行陈述交互结果。该行与 `todo_write` 完全一样注册进带 key 的 `tool.call.toolview` 槽位，并复用共享的 `ToolRow`（外观、运行扫光、前导展开）。其摘要是交互裁决而非参数：运行中显示 `waiting`，结算后从结果 JSON 得出 `N/M answered`（被跳过的回答 —— `selected` 为空且无 `custom` —— 不计入），`ASK_CANCELLED` 显示 `cancelled`，`ASK_ABORTED` 显示 `interrupted` 并沿用共享的琥珀色 stopped 语义。畸形或截断的结果回退到通用摘要。`PendingCard` 曾收窄为 `PendingWait<'approval'>`，`ChatView` 曾将待处理列表过滤为仅审批等待，使占位卡片只服务于审批；其后审批输入区接管（[Web 权限与审批](2026-07-23-web-permission-and-approval.zh.md)）已将它彻底移除。

成功行折叠时仍只显示一行裁决，展开区域则以只读问题 transcript 取代通用 JSON。presenter 校验调用参数中的问题与结果内容中的回答，按回显的稳定 `id` 配对并保持调用顺序；每个模型撰写的问题以弱化标签显示，其后用主要文本显示选项回答和自定义回答。跳过的问题显示本地化的 `Not answered` 裁决。卡片设有高度上限并在内部滚动。JSON 无效、id 重复或缺失、数量不匹配、出现未知回答 id 或可见字段无效时，都会保留通用输入／输出卡片，不呈现不完整或错误配对的 transcript。

取消或中断的行没有可配对的回答载荷。展开卡片先显示本地化的整组裁决，说明没有提交回答，再显示模型撰写的原始问题；它不会把取消标为逐问题跳过，也不会捏造回答记录。调用参数无效时保留通用诊断卡片。取消由用户主动选择，因此使用中性的已结算状态；中断保持琥珀色 stopped 状态。

输入区重设计将分页移到底部操作区旁，多选选项渲染显式复选框，单选保留编号行，并用始终可见的自定义输入行取代展开式自定义入口（无选项问题用多行文本框）。删除 `parseQuestionTitle` 的多选后缀约定；`multi_select` 已是结构化元数据，标题原样渲染。

输入区界面文案实现双语：插件在 `dsh-client-locale` 的 `question` 命名空间下注册中英词典，并通过 slot inject face 向条目提供绑定命名空间的翻译器和作为 hooks compartment 来源的 locale 快照，语言切换时已挂载的输入区会重新渲染。校验反馈以词典 key 存储、切换时重新翻译；载体失败消息与所有模型撰写的问题/选项文本原样渲染。

两个相邻修复随行。所有通用 toolview 前导图标（含悬停箭头）现在统一继承三级标签色 —— 删除了 others 变体的二级色覆盖和独立的箭头颜色规则，只保留有意为之的 cordis 业务主色强调。客户端 dev-watch 打包器用 `addWatchFile` 注册每个 CSS 模块，因为虚拟模块间接层此前使仅改 CSS 的编辑对 watcher 不可见。

## 曾考虑的替代方案

**继续通过 `PendingCard` 渲染问题。** 否决：该卡片是接管存在之前的只读占位，导致同一内容显示两份且其中一份不可作答。toolview 行加接管同时覆盖了记录与收集两个面。

**在折叠的会话记录行内显示问题或回答。** 否决：输入区接管拥有回答收集，而行的约定（`todo_write`）是保持折叠行易于扫描。因此行在展开前只报告结果；展开区域负责只读的问题 transcript。

**在展开区域保留原始输入与输出 JSON。** 否决：载荷保存了全部信息，但用户难以快速查看自己的回答或已取消的问题。结构化视图呈现同一份撰写文本；当问题解析或回答配对不可信时，仍以原始 JSON 作为 fail-closed 回退。

**用通用错误形态渲染 `ASK_CANCELLED`/`ASK_ABORTED`。** 否决：放弃是用户自己的主动操作，打断是共享的停止手势；两者都是预期结果而非工具失败。命名裁决（且中止保持琥珀色 stopped 语义）与其他被打断的工具调用的呈现一致。

**保持行内裁决使用英文。** 最初曾推迟，后来 Client UI 文案统一归 locale 所有后已被取代：当前 conversation 词典会本地化行内裁决与展开卡片中的跳过回答标签，而模型撰写的问题和回答保持原样。

**保留标题后缀的多选约定。** 否决：`multi_select` 是结构化请求元数据且复选框标识已承载该信号，从模型文本解析 `（可多选）` 是脆弱的重复通道。

## 后果

`ask_user_question` 与 `todo_write` 现在共同示范预期的 toolview 模式：复用 `ToolRow`、从调用参数或结果 JSON 做带形状校验回退的摘要、通过带 key 的 slot 注册。专用的 `todo-row.module.css` 已删除。

展开 transcript 为共享 `ToolRow` 增加了类型化的纯数据问题卡片模型；其他工具视图保持各自现有的通用或专用卡片。问题行只读取持久化的调用与结果字段，不添加 Host presentation 字段。审批输入区接管已交付（[Web 权限与审批](2026-07-23-web-permission-and-approval.zh.md)，并按[审批面板 Agent Note](../bug-fix/2026-07-30-approval-panel-command-cap.zh.md)施加高度上限），`PendingCard` 已不复存在。

`ui-user-questions` 新增 `dsh-client-locale` 依赖和此前没有的 inject face；其约定（`QuestionComposerInjected`）与消费方一起放在 `contract/slots.ts`。

## 验证

`ui-tool` 测试钉住行的 waiting／answered／skipped／cancelled／interrupted 矩阵、基于 id 的可读配对、选项与自定义回答行、无回答裁决及 fail-closed 回退。无密钥组装 Web 快照会展开成功与取消的问题行，并记录其可读 transcript。`ui-user-questions` 测试钉住重设计的输入区（复选框多选、始终可见的自定义行、底部分页、词典 key 反馈重翻译、IME 安全的 Enter）以及插件的词典注册与 inject face；`ui-primitives` 测试钉住图标集。组装后的 Web GUI 在真实会话中演练了回答、取消与轮次打断路径。

# Agent Note: 客户端界面文案归属门禁

Status: implemented

[English](2026-09-08-client-ui-copy-ownership.md) | 中文

## 问题

客户端视图源码中存在用于标注点、配对载荷、成员角色、运行时错误和控件标题的可见英文文本。源码门禁还会把完整 HTML 文档及稳定的品牌、协议和诊断文本当作普通界面文案，因此无法区分正确修复与整文件抑制。

## 决策

可见文案由各功能的强类型中英文 locale 字典管理。图片标注点接收翻译后的标签回调，配对载荷使用 Desktop locale 文案，Workspace 角色选项使用 Workspace locale 键，Better Sidebar 管理渲染错误、缺失分块错误和保存标题文案。Conversation 展示层使用已有 locale 所有者，不再复制公共键。删除未使用的 UI Renderer 文档标题实现，浏览器标题继续由 UI Layout 管理。

源码门禁接受标准 `translate="no"` 属性，用于不应翻译的 HTML 子树；React 类型未提供 `translate` 属性时，SVG 品牌文本使用 `data-ui-i18n="brand"`。当文本属于对应类别时，变量声明可使用 `@uiI18n brand`、`@uiI18n protocol` 或 `@uiI18n diagnostic`。门禁会检查完整 HTML 文档文本中的可见正文，以及静态 `alt`、ARIA、placeholder 和 title 属性，同时允许结构标记。这些规则不豁免任何文件。

## 验证

源码门禁单元测试覆盖允许及拒绝的类别标签、带有相邻可见文案的不翻译 JSX、结构化 HTML，以及 HTML 正文和无障碍文案。定点 locale 测试在中英文之间切换 Better Sidebar，并断言新增的运行时错误和共享保存标题。组件测试通过渲染后的无障碍名称断言翻译后的图片标注点标签和既有配对载荷标签。

## 考虑过的替代方案

**重命名变量或豁免文件。** 这会隐藏可见文本，却不为它们指定 locale 所有者，并允许后续文案绕过门禁。

**忽略所有完整 HTML 文本。** 这能避免结构标记误报，但会漏掉生成文档中的静态正文和无障碍标签。

**翻译稳定品牌和持久协议值。** 翻译会改变标识或持久匹配值，而非改变用户界面语言。

## 后果

客户端文案只有一个强类型 locale 所有者，并随当前 locale 切换。作者必须显式分类少量不变文本；门禁继续检查这些不变文本周围的可见 JSX 和 HTML 文案。

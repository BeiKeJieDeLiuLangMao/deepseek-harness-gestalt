/** Mobile-owned conversation copy for the phone detail view. */

/** Product locales used by the Mobile conversation screen. */
export type MobileConversationLocale = 'zh' | 'en'

const CONVERSATION_ZH = {
  copy: '复制',
  copied: '复制成功',
  loading: '加载中…',
  collapse: '收起',
  expand: '展开',
  'placeholder.default': '给智能体发消息',
  'placeholder.unavailable': '会话不可用',
  'input.send': '发送消息',
  'input.stop': '停止生成',
  'chat.loadOlder': '加载更早',
  'chat.loadingHistory': '载入历史…',
  'chat.loadError': '历史加载失败：{message}（{code}）',
  'approval.waiting': '等待审批',
  'approval.detailAria': '审批详情',
  'approval.escalation': '工具 {toolName} 请求越权执行',
  'approval.reject': '拒绝',
  'approval.allowOnce': '允许一次',
  'tool.title.edit': '编辑',
  'tool.title.bash': 'Bash',
  'tool.title.generic': '工具调用',
  'diff.files.one': '{count} 个文件',
  'diff.files.other': '{count} 个文件',
  'diff.collapseAria': '收起差异',
  'diff.expandAria': '展开其余 {count} 行差异',
  'diff.expandRest': '… 其余 {count} 行',
  'terminal.signal': '信号 {signal}',
  'terminal.exitCode': '退出码 {code}',
  'terminal.running': '运行中',
  'terminal.failed': '失败',
  'terminal.done': '已完成',
  'terminal.noOutput': '无输出',
  'terminal.collapseAria': '收起输出',
  'terminal.expandAria': '展开其余 {n} 行输出',
  'terminal.expandRest': '… 其余 {n} 行',
  'image.label': '图片',
  'image.openOriginal': '查看原图',
  'image.openOriginalLabel': '{label}，点击查看原图',
  'image.loading': '加载中…',
  'image.loadFailed': '图片加载失败',
  'image.preview': '原图预览',
  'image.closePreview': '关闭原图预览',
  'message.unknownSurface': '未知 surface 事件：{type}',
  'json.truncated': '… 已截断，共 {total} 字符',
  footnotes: '脚注',
  'message.contextInjection': '上下文注入',
  'message.compaction': '压缩',
  'message.compaction.completed': '已压缩 {items} 项 · {tokens} token',
  'message.compaction.expand': '查看摘要',
  'message.compaction.unavailable': '摘要不可用',
} as const

const CONVERSATION_EN = {
  copy: 'Copy',
  copied: 'Copied',
  loading: 'Loading…',
  collapse: 'Collapse',
  expand: 'Expand',
  'placeholder.default': 'Message the agent',
  'placeholder.unavailable': 'Session unavailable',
  'input.send': 'Send message',
  'input.stop': 'Stop generating',
  'chat.loadOlder': 'Load earlier',
  'chat.loadingHistory': 'Loading history…',
  'chat.loadError': 'Failed to load history: {message} ({code})',
  'approval.waiting': 'Waiting for approval',
  'approval.detailAria': 'Approval details',
  'approval.escalation': 'Tool {toolName} requests privileged execution',
  'approval.reject': 'Reject',
  'approval.allowOnce': 'Allow once',
  'tool.title.edit': 'Edit',
  'tool.title.bash': 'Bash',
  'tool.title.generic': 'Tool call',
  'diff.files.one': '{count} file',
  'diff.files.other': '{count} files',
  'diff.collapseAria': 'Collapse diff',
  'diff.expandAria': 'Expand the remaining {count} diff lines',
  'diff.expandRest': '… {count} more lines',
  'terminal.signal': 'signal {signal}',
  'terminal.exitCode': 'exit code {code}',
  'terminal.running': 'Running',
  'terminal.failed': 'Failed',
  'terminal.done': 'Done',
  'terminal.noOutput': 'No output',
  'terminal.collapseAria': 'Collapse output',
  'terminal.expandAria': 'Expand the remaining {n} output lines',
  'terminal.expandRest': '… {n} more lines',
  'image.label': 'Image',
  'image.openOriginal': 'View original',
  'image.openOriginalLabel': '{label}, click to view original',
  'image.loading': 'Loading image…',
  'image.loadFailed': 'Image failed to load; click to retry',
  'image.preview': 'Original image preview',
  'image.closePreview': 'Close original image preview',
  'message.unknownSurface': 'Unknown surface event: {type}',
  'json.truncated': '… truncated, {total} characters total',
  footnotes: 'Footnotes',
  'message.contextInjection': 'Context injection',
  'message.compaction': 'Compaction',
  'message.compaction.completed': 'Compacted {items} items · {tokens} tokens',
  'message.compaction.expand': 'View summary',
  'message.compaction.unavailable': 'Summary unavailable',
} as const

const QUESTION_ZH = {
  submit: '提交',
  submitting: '正在提交…',
  'nav.next': '下一题',
  'nav.prev': '上一题',
  'nav.cancel': '放弃整组问题',
  'error.incomplete': '请先完成这道问题。',
  'error.unanswered': '请选择一个选项或填写自定义答案。',
  'custom.placeholder': '输入你的答案',
  'action.skip': '跳过本题',
  'action.next': '下一题',
} as const

const QUESTION_EN = {
  submit: 'Submit',
  submitting: 'Submitting…',
  'nav.next': 'Next question',
  'nav.prev': 'Previous question',
  'nav.cancel': 'Dismiss all questions',
  'error.incomplete': 'Please complete this question first.',
  'error.unanswered': 'Please select an option or enter a custom answer.',
  'custom.placeholder': 'Type your answer',
  'action.skip': 'Skip this question',
  'action.next': 'Next',
} as const

/** Conversation copy lookup used by Mobile conversation chrome. */
export type MobileConversationCopy = (key: string, params?: Record<string, unknown>) => string

/**
 * Bind Mobile conversation copy without a Client Runtime or UI plugin translator.
 * @param locale - selected product locale.
 * @returns lookup that interpolates `{name}` placeholders.
 */
export function conversationPresentationTranslate(locale: MobileConversationLocale): MobileConversationCopy {
  const dictionary: Record<string, string> = locale === 'zh' ? CONVERSATION_ZH : CONVERSATION_EN
  return (key, params) => interpolate(dictionary[key] ?? key, params)
}

/**
 * Bind Mobile Ask User copy.
 * @param locale - selected product locale.
 * @returns lookup that ignores unused template parameters.
 */
export function questionPresentationTranslate(locale: MobileConversationLocale): MobileConversationCopy {
  const dictionary: Record<string, string> = locale === 'zh' ? QUESTION_ZH : QUESTION_EN
  return (key, params) => interpolate(dictionary[key] ?? key, params)
}

function interpolate(template: string, params?: Record<string, unknown>): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    Object.hasOwn(params, name) ? String(params[name]) : match
  ))
}

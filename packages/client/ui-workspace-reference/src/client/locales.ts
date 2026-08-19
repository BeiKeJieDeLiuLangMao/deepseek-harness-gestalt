/**
 * Workspace Reference product copy. Chinese is the key-set source of truth.
 */

/** Simplified Chinese dictionary. */
export const zh = {
  'nav': '工作区引用',
  'dock.open': '打开',
  'dock.remove': '移除',
  'settings.enable': '启用工作区引用',
  'settings.pasteIgnore': '粘贴时忽略 @ 路径',
  'settings.exact': '精确过滤（文件名包含）',
  'settings.regex': '正则过滤（文件名）',
} as const

/** English dictionary, checked complete against the zh key set. */
export const en: { [K in keyof typeof zh]: string } = {
  'nav': 'Workspace Reference',
  'dock.open': 'Open',
  'dock.remove': 'Remove',
  'settings.enable': 'Enable Workspace References',
  'settings.pasteIgnore': 'Ignore @ paths on paste',
  'settings.exact': 'Exact filter (basename contains)',
  'settings.regex': 'Regex filter (basename)',
}

/** Locale key union. */
export type WorkspaceReferenceKey = keyof typeof zh

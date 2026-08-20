/**
 * Workspace Reference product copy. Chinese is the key-set source of truth.
 */

/** Simplified Chinese dictionary. */
export const zh = {
  'nav': '工作区引用',
  'settings.enable': '启用工作区引用',
  'settings.pasteIgnore': '粘贴时忽略 @ 路径',
  'settings.exact': '精确过滤（文件名包含）',
  'settings.regex': '正则过滤（文件名）',
  'settings.regexInvalid': '正则无效；在模式可编译之前不过滤。',
} as const

/** English dictionary, checked complete against the zh key set. */
export const en: { [K in keyof typeof zh]: string } = {
  'nav': 'Workspace Reference',
  'settings.enable': 'Enable Workspace References',
  'settings.pasteIgnore': 'Ignore @ paths on paste',
  'settings.exact': 'Exact filter (basename contains)',
  'settings.regex': 'Regex filter (basename)',
  'settings.regexInvalid': 'Invalid regular expression; filtering stays off until the pattern compiles.',
}

/** Locale key union. */
export type WorkspaceReferenceKey = keyof typeof zh

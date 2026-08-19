/** `browser` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'browser'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'dock.collapse': '收起浏览器',
  'dock.refresh': '刷新',
  'dock.address': '地址',
  'dock.closeTab': '关闭标签页',
  'dock.takeover': '接管',
  'dock.return': '交还智能体',
  'dock.empty': '没有打开的页面',
  'preview.select': '切换到 {title}',
  'preview.open': '展开 {title}',
  'page.untitled': '无标题',
} satisfies Record<string, string>

/** The browser namespace key union. */
export type BrowserKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'dock.collapse': 'Collapse browser',
  'dock.refresh': 'Refresh',
  'dock.address': 'Address',
  'dock.closeTab': 'Close tab',
  'dock.takeover': 'Take control',
  'dock.return': 'Return to Agent',
  'dock.empty': 'No open pages',
  'preview.select': 'Switch to {title}',
  'preview.open': 'Expand {title}',
  'page.untitled': 'Untitled',
} satisfies Record<BrowserKey, string>

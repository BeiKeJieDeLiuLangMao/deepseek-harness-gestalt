/** Desktop chrome copy. Product strings are Chinese; English is the fallback. */

export const zh = {
  'update.check': '检查更新',
  'update.checking': '正在检查更新',
  'update.available': '下载 {version}',
  'update.downloading': '正在下载 {percent}%',
  'update.install': '安装并重启',
  'update.idle': '已是最新',
  'update.disabled': '开发版不检查更新',
  'update.error': '更新失败',
  'window.minimize': '最小化',
  'window.maximize': '最大化',
  'window.close': '关闭',
} as const

/** English fallback for Desktop chrome copy. */
export const en = {
  'update.check': 'Check for updates',
  'update.checking': 'Checking for updates',
  'update.available': 'Download {version}',
  'update.downloading': 'Downloading {percent}%',
  'update.install': 'Install and restart',
  'update.idle': 'Up to date',
  'update.disabled': 'Updates disabled in development',
  'update.error': 'Update failed',
  'window.minimize': 'Minimize',
  'window.maximize': 'Maximize',
  'window.close': 'Close',
} as const

/** Locale keys owned by Desktop chrome. */
export type DesktopKey = keyof typeof zh

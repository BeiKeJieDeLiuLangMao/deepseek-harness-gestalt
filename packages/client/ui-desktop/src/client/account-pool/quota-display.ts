/** Product labels and reset copy for account-pool quota windows. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopKey } from '../locales.ts'
import type { DesktopAccountPoolQuotaWindow } from '../../protocol.ts'

export type AccountPoolCopy = Translate<DesktopKey>

/** One window the quota face should draw. */
export interface VisibleQuotaWindow {
  readonly key: string
  readonly title: string
  readonly remainingPercent?: number
  readonly timeRemainingPercent?: number
  readonly resetAtMs?: number
  readonly group?: string
  readonly groupDescription?: string
  readonly status: DesktopAccountPoolQuotaWindow['status']
}

/**
 * Map observed windows to original management-center titles
 * and keep group headings when the source supplied them.
 */
export function visibleQuotaWindows(
  windows: readonly DesktopAccountPoolQuotaWindow[],
  t: AccountPoolCopy,
): readonly VisibleQuotaWindow[] {
  return windows.flatMap((window) => {
    const title = quotaWindowTitle(window, t)
    if (title === undefined) return []
    return [{
      key: window.key,
      title,
      status: window.status,
      ...window.remainingPercent === undefined ? {} : { remainingPercent: window.remainingPercent },
      ...window.timeRemainingPercent === undefined ? {} : { timeRemainingPercent: window.timeRemainingPercent },
      ...window.resetAtMs === undefined ? {} : { resetAtMs: window.resetAtMs },
      ...window.group === undefined ? {} : { group: window.group },
      ...window.groupDescription === undefined ? {} : { groupDescription: window.groupDescription },
    }]
  })
}

/** Human title for one quota window, or undefined to hide it. */
export function quotaWindowTitle(window: DesktopAccountPoolQuotaWindow, t: AccountPoolCopy): string | undefined {
  const named = namedLimit(window, t)
  if (named !== undefined) return named
  if (window.label.length > 0 && window.label !== window.key) return window.label
  const hours = window.periodHours
  if (hours === 5) return t('sub2api.limit5h')
  if (hours !== undefined && hours >= 23 && hours <= 25) return t('sub2api.limitDaily')
  if (hours !== undefined && hours >= 167 && hours <= 169) return t('sub2api.limitWeekly')
  if (hours !== undefined && hours >= 28 * 24 && hours <= 31 * 24) return t('sub2api.limitMonthly')
  const key = window.key.toLowerCase()
  if (key === 'weekly' || key.includes('week')) return t('sub2api.limitWeekly')
  if (key === 'monthly' || key.includes('month')) return t('sub2api.limitMonthly')
  if (key === '5h' || key.includes('five_hour') || key.includes('five-hour')) return t('sub2api.limit5h')
  if (key === 'summary') return t('sub2api.limitWeekly')
  if (key === 'limit-0') return t('sub2api.limit5h')
  if (/^limit-\d+$/.test(key)) return hours === undefined ? undefined : t('sub2api.limitHours', { hours })
  if (window.label.length > 0 && window.label !== window.key) return window.label
  return undefined
}

/** Plan chip copy matching the original management-center badges. */
export function quotaPlanLabel(planType: string | undefined): string | undefined {
  if (planType === undefined || planType.length === 0) return undefined
  switch (planType.toLowerCase()) {
    case 'pro': return 'Pro 20x'
    case 'prolite': return 'Pro 5x'
    case 'plus': return 'Plus'
    case 'team': return 'Team'
    case 'free': return 'Free'
    case 'ultra': return 'Ultra'
    case 'ultralite': return 'Ultra Lite'
    default: return planType
  }
}

/** Reset stamp plus relative remainder, matching `09/11 13:17 · 1 hour ago`. */
export function quotaResetText(resetAtMs: number | undefined, t: AccountPoolCopy, now = Date.now()): string {
  if (resetAtMs === undefined) return ''
  const date = new Date(resetAtMs)
  if (Number.isNaN(date.getTime())) return ''
  const stamp = `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  const delta = resetAtMs - now
  const relativeText = relative(Math.abs(delta), t)
  return t(delta >= 0 ? 'sub2api.relativeAfter' : 'sub2api.relativeBefore', { stamp, relative: relativeText })
}

function namedLimit(window: DesktopAccountPoolQuotaWindow, t: AccountPoolCopy): string | undefined {
  const match = /^(?:additional-)(.+?)-(five-hour|weekly|monthly|primary|secondary)$/.exec(window.key)
  if (match === null) return undefined
  const name = window.label.length > 0 && window.label !== window.key ? window.label : match[1] ?? ''
  if (name.length === 0) return undefined
  const suffix = periodSuffix(window, t, match[2])
  return suffix === undefined ? name : `${name} ${suffix}`
}

function periodSuffix(window: DesktopAccountPoolQuotaWindow, t: AccountPoolCopy, kind?: string): string | undefined {
  const hours = window.periodHours
  if (hours === 5 || kind === 'five-hour') return t('sub2api.limit5h')
  if ((hours !== undefined && hours >= 167 && hours <= 169) || kind === 'weekly') return t('sub2api.limitWeekly')
  if ((hours !== undefined && hours >= 28 * 24 && hours <= 31 * 24) || kind === 'monthly') return t('sub2api.limitMonthly')
  return undefined
}

function relative(ms: number, t: AccountPoolCopy): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return t('sub2api.relativeMinute')
  if (minutes < 60) return t('sub2api.relativeMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('sub2api.relativeHours', { count: hours })
  return t('sub2api.relativeDays', { count: Math.floor(hours / 24) })
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Localized copy for the Session Schedule task board. */

/** Locale namespace for Schedule task-board copy. */
export const NS = 'schedule' as const

/** Simplified Chinese Schedule task-board dictionary. */
export const zh = {
  'count.active.one': '{count} 个定时任务等待执行',
  'count.active.other': '{count} 个定时任务等待执行',
  'count.short': '{count} 个定时任务',
  'list.aria': '定时任务',
  'list.title': '定时任务',
  'list.scope': '仅在此 Session 内执行',
  'state.scheduled': '等待中',
  'state.overdue': '待补跑',
  'state.paused': '已暂停',
  'rule.once': '一次',
  'rule.every': '每 {duration}',
  'duration.minutes': '{minutes} 分钟',
  'duration.hours': '{hours} 小时',
  'duration.days': '{days} 天',
  'action.pause': '暂停 {prompt}',
  'action.resume': '恢复 {prompt}',
  'action.delete': '删除 {prompt}',
  'action.confirmDelete': '确认删除 {prompt}',
  'action.cancelDelete': '取消删除 {prompt}',
  'delete.confirm': '确认删除？',
  'delete.yes': '删除',
  'delete.no': '取消',
  'error.fallback': '操作失败',
} as const

/** Stable Schedule task-board message keys. */
export type ScheduleKey = keyof typeof zh

/** English Schedule task-board dictionary. */
export const en: Record<ScheduleKey, string> = {
  'count.active.one': '{count} scheduled task waiting',
  'count.active.other': '{count} scheduled tasks waiting',
  'count.short': '{count} scheduled tasks',
  'list.aria': 'Scheduled tasks',
  'list.title': 'Scheduled tasks',
  'list.scope': 'Runs only in this Session',
  'state.scheduled': 'Waiting',
  'state.overdue': 'Overdue',
  'state.paused': 'Paused',
  'rule.once': 'Once',
  'rule.every': 'Every {duration}',
  'duration.minutes': '{minutes} min',
  'duration.hours': '{hours} hr',
  'duration.days': '{days} d',
  'action.pause': 'Pause {prompt}',
  'action.resume': 'Resume {prompt}',
  'action.delete': 'Delete {prompt}',
  'action.confirmDelete': 'Confirm deleting {prompt}',
  'action.cancelDelete': 'Cancel deleting {prompt}',
  'delete.confirm': 'Delete this task?',
  'delete.yes': 'Delete',
  'delete.no': 'Cancel',
  'error.fallback': 'Action failed',
}

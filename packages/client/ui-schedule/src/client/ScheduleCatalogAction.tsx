import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { ScheduleProjectionItem, ScheduleRecord } from '@deepseek-ai/dsh-schedule/client'
import {
  IconAlarmClockOutline16,
  IconChevronDownOutline14,
  IconPauseOutline16,
  IconPlayOutline16,
  IconTrashOutline16,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS } from './locales.ts'
import css from './ScheduleCatalogAction.module.css'
import type { ScheduleActions } from './slots.ts'

/** Full props for the Session-header Schedule catalog action. */
export type ScheduleCatalogActionProps =
  PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS> & ScheduleActions

type TimeUnit = 'day' | 'hour' | 'minute' | 'second'

const EMPTY_RECORDS: readonly ScheduleProjectionItem[] = []
const SECOND_MS = 1_000
const SECOND_UNIT = { unit: 'second', seconds: 1 } as const
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }
const UNIT_SECONDS: readonly { unit: TimeUnit; seconds: number }[] = [
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
  SECOND_UNIT,
]

/** Localized unit word for one integral magnitude. */
function unitLabel(unit: TimeUnit, value: number, t: TranslateNS<typeof NS>): string {
  const keys = {
    day: ['unit.day.one', 'unit.day.other'],
    hour: ['unit.hour.one', 'unit.hour.other'],
    minute: ['unit.minute.one', 'unit.minute.other'],
    second: ['unit.second.one', 'unit.second.other'],
  } as const
  const pair = keys[unit]
  return t(value === 1 ? pair[0] : pair[1], { count: value })
}

/** Pick the largest exact whole unit without rounding the durable interval. */
export function formatScheduleFrequency(
  record: ScheduleRecord,
  t: TranslateNS<typeof NS>,
): string {
  if (record.kind !== 'every') return t('frequency.once')
  let selected: { unit: TimeUnit; seconds: number } = SECOND_UNIT
  for (const candidate of UNIT_SECONDS) {
    if (record.everySeconds % candidate.seconds !== 0) continue
    selected = candidate
    break
  }
  const value = record.everySeconds / selected.seconds
  return t('frequency.every', { value, unit: unitLabel(selected.unit, value, t) })
}

/** Format the durable UTC target in the browser's current locale and time zone. */
export function formatScheduleLocalTime(scheduledAt: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(Date.parse(scheduledAt))
}

/** Human relative target using the largest natural clock unit. */
export function formatScheduleRelative(
  scheduledAt: string,
  now: number,
  t: TranslateNS<typeof NS>,
): string {
  const difference = Date.parse(scheduledAt) - now
  if (difference === 0) return t('relative.now')
  const absoluteSeconds = Math.abs(difference) / SECOND_MS
  const selected = UNIT_SECONDS.find(candidate => absoluteSeconds >= candidate.seconds)
    ?? SECOND_UNIT
  const value = Math.max(1, difference > 0
    ? Math.ceil(absoluteSeconds / selected.seconds)
    : Math.floor(absoluteSeconds / selected.seconds))
  const unit = unitLabel(selected.unit, value, t)
  return t(difference > 0 ? 'relative.future' : 'relative.overdue', { value, unit })
}

/** Overdue records first, then ascending target time; exact ties stay stable. */
export function orderScheduleRecords(
  records: readonly ScheduleProjectionItem[],
  now: number,
): ScheduleProjectionItem[] {
  return records.map((record, index) => ({ record, index })).sort((left, right) => {
    const leftTime = Date.parse(left.record.scheduledAt)
    const rightTime = Date.parse(right.record.scheduledAt)
    const leftOverdue = leftTime <= now
    const rightOverdue = rightTime <= now
    if (leftOverdue !== rightOverdue) return Number(rightOverdue) - Number(leftOverdue)
    return leftTime - rightTime || left.index - right.index
  }).map(({ record }) => record)
}

/** Current-Session reminder catalog with human management controls. */
export function ScheduleCatalogAction({
  useSession,
  useProjection,
  onPause,
  onResume,
  onDelete,
  t,
}: ScheduleCatalogActionProps) {
  const openState = useSession(snapshot => snapshot.openState)
  const projected = useProjection('schedule')
  const records = projected ?? EMPTY_RECORDS
  const visible = openState === 'open' && records.length > 0
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState<ScheduleProjectionItem['id'] | null>(null)
  const [pending, setPending] = useState<ScheduleProjectionItem['id'] | null>(null)
  const [error, setError] = useState<{
    readonly id: ScheduleProjectionItem['id']
    readonly message: string
  } | null>(null)
  const pendingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const catalogRef = useRef<HTMLUListElement>(null)
  const catalogPosition = useAnchoredPosition({
    open,
    anchorRef: triggerRef,
    panelRef: catalogRef,
    side: 'bottom',
    gap: 5,
    margin: 16,
  })

  useDismissOnOutsidePointer(rootRef, open, setOpen, catalogRef)

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, SECOND_MS)
    return () => { clearInterval(timer) }
  }, [open])

  useEffect(() => {
    if (visible || !open) return
    setOpen(false)
  }, [visible, open])

  useEffect(() => {
    if (confirming !== null && !records.some(record => record.id === confirming)) setConfirming(null)
    if (error !== null && !records.some(record => record.id === error.id)) setError(null)
  }, [confirming, error, records])

  const run = useCallback(async (
    id: ScheduleProjectionItem['id'],
    action: () => Promise<Awaited<ReturnType<ScheduleActions['onPause']>>>,
  ): Promise<void> => {
    /* v8 ignore next -- every action control is synchronously disabled while one mutation is pending. */
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(id)
    setError(null)
    try {
      const result = await action()
      if (!result.ok) setError({ id, message: result.error.message || t('error.fallback') })
    } catch (cause: unknown) {
      setError({ id, message: cause instanceof Error ? cause.message : t('error.fallback') })
    } finally {
      pendingRef.current = false
      setPending(null)
    }
  }, [t])

  const rows = useMemo(() => orderScheduleRecords(records, now), [records, now])

  if (!visible) return null

  const activeCount = records.filter(record => !record.paused).length
  const countKey = activeCount === 1 ? 'trigger.one' : 'trigger.other'
  const countLabel = t(countKey, { count: activeCount })
  const toggleCatalog = (): void => {
    setNow(Date.now())
    setOpen(current => !current)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={css.trigger}
      aria-expanded={open}
      aria-label={countLabel}
      onClick={toggleCatalog}
    >
      <IconAlarmClockOutline16 size={14} />
      <span className={css.count}>{countLabel}</span>
      <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
    </button>
  )
  const catalog = open
    ? createPortal((
      <ul
        ref={catalogRef}
        className={css.menu}
        style={catalogPosition ?? MEASURE_STYLE}
        aria-label={t('list.aria')}
      >
        {rows.map((record) => {
          const overdue = !record.paused && Date.parse(record.scheduledAt) <= now
          const isPending = pending === record.id
          const isConfirming = confirming === record.id
          const statusKey = record.paused ? 'status.paused' : overdue ? 'status.overdue' : 'status.scheduled'
          return (
            <li
              key={record.id}
              className={record.paused
                ? `${css.row} ${css.rowPaused}`
                : overdue ? `${css.row} ${css.rowOverdue}` : css.row}
            >
              <span className={css.rowHeader}>
                <span className={css.status}>
                  <span className={css.statusDot} aria-hidden="true" />
                  <span>{t(statusKey)}</span>
                </span>
                <span className={css.actions}>
                  <button
                    type="button"
                    className={css.iconButton}
                    disabled={pending !== null}
                    aria-label={t(record.paused ? 'action.resume' : 'action.pause', { prompt: record.prompt })}
                    onClick={() => {
                      void run(record.id, () => record.paused ? onResume(record.id) : onPause(record.id))
                    }}
                  >{record.paused ? <IconPlayOutline16 /> : <IconPauseOutline16 />}</button>
                  <button
                    type="button"
                    className={`${css.iconButton} ${css.deleteButton}`}
                    disabled={pending !== null}
                    aria-label={t('action.delete', { prompt: record.prompt })}
                    onClick={() => { setConfirming(record.id) }}
                  ><IconTrashOutline16 /></button>
                </span>
              </span>
              <span className={css.prompt}>{record.prompt}</span>
              <span className={css.metadata}>
                <span>{formatScheduleFrequency(record, t)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatScheduleLocalTime(record.scheduledAt, document.documentElement.lang)}</span>
                <span aria-hidden="true">·</span>
                <span className={overdue ? css.relativeOverdue : undefined}>
                  {formatScheduleRelative(record.scheduledAt, now, t)}
                </span>
              </span>
              {error?.id === record.id ? <em className={css.error} role="alert">{error.message}</em> : null}
              {isConfirming
                ? (
                  <span className={css.confirm}>
                    <span>{t('delete.confirm')}</span>
                    <button
                      type="button"
                      disabled={isPending}
                      aria-label={t('action.confirmDelete', { prompt: record.prompt })}
                      onClick={() => {
                        void run(record.id, () => onDelete(record.id))
                        setConfirming(null)
                      }}
                    >{t('delete.yes')}</button>
                    <button
                      type="button"
                      disabled={isPending}
                      aria-label={t('action.cancelDelete', { prompt: record.prompt })}
                      onClick={() => { setConfirming(null) }}
                    >{t('delete.no')}</button>
                  </span>
                )
                : null}
            </li>
          )
        })}
      </ul>
    ), document.body)
    : null

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      {trigger}
      {catalog}
    </div>
  )
}

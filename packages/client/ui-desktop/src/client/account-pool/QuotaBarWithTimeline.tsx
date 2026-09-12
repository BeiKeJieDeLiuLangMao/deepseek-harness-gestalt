/** Quota remaining fill with an optional time-window needle. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './QuotaBarWithTimeline.module.css'

type DesktopCopy = PropsLocale<'desktop'>['t']

export interface QuotaBarWithTimelineProps {
  t: DesktopCopy
  percentRemaining?: number
  timeRemainingPercent?: number
  name: string
  windowLabel: string
  resetText: string
  isReliable: boolean
}

export function QuotaBarWithTimeline({
  t,
  percentRemaining,
  timeRemainingPercent,
  name,
  windowLabel,
  resetText,
  isReliable,
}: QuotaBarWithTimelineProps) {
  const boundedQuota = percentRemaining === undefined ? undefined : Math.max(0, Math.min(100, percentRemaining))
  const boundedTime = timeRemainingPercent === undefined ? undefined : Math.max(0, Math.min(100, timeRemainingPercent))
  const quotaColor = boundedQuota === undefined || boundedQuota === 0
    ? 'var(--dsw-alias-state-error-primary, #ef4444)'
    : boundedQuota < 30
      ? 'var(--dsw-alias-state-error-primary, #ef4444)'
      : boundedQuota < 70
        ? 'var(--dsw-alias-state-warning-primary, #f59e0b)'
        : 'var(--dsw-alias-state-success-primary, #10b981)'
  const quotaFill = isReliable ? boundedQuota : undefined
  const timeFill = isReliable ? boundedTime : undefined
  return (
    <div className={css.container}>
      <div className={css.labelRow}>
        <div className={css.nameGroup}>
          <span className={css.metricName} title={name}>{name}</span>
          <span className={css.windowBadge}>{windowLabel}</span>
        </div>
        <div className={css.metaGroup}>
          <span className={css.percentText} style={{ color: quotaFill === undefined ? 'var(--dsw-alias-label-tertiary, #94a3b8)' : quotaColor }}>
            {quotaFill === undefined ? t('pool.quota.unknown') : `${String(Math.round(quotaFill))}%`}
          </span>
          <span className={css.resetTime}>{resetText}</span>
        </div>
      </div>
      <div className={css.track}>
        {quotaFill !== undefined && (
          <div className={css.quotaFill} style={{ width: `${String(quotaFill)}%`, backgroundColor: quotaColor }} />
        )}
        {timeFill !== undefined && (
          <div className={css.timelineMarker} style={{ left: `${String(timeFill)}%` }} title={t('pool.quota.timeRemainingTitle').replace('{percent}', String(Math.round(timeFill)))}>
            <div className={css.needleArrow} style={{ borderTopColor: quotaColor }} />
            <div className={css.needleLine} style={{ background: quotaColor }} />
          </div>
        )}
      </div>
      {timeFill !== undefined && (
        <div className={css.legendRow}>
          <span className={css.legendItem}>
            <span className={css.quotaDot} style={{ backgroundColor: quotaColor }} />
            {t('pool.quota.remaining').replace('{percent}', String(Math.round(quotaFill ?? 0)))}
          </span>
          <span className={css.legendItem}>
            <span className={css.timeDot} style={{ background: quotaColor }} />
            {t('pool.quota.windowRemaining').replace('{percent}', String(Math.round(timeFill)))}
          </span>
        </div>
      )}
    </div>
  )
}

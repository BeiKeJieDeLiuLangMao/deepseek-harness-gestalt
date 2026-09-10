/** Quota remaining fill with an optional time-window needle. */
import css from './QuotaBarWithTimeline.module.css'

export interface QuotaBarWithTimelineProps {
  percentRemaining?: number
  timeRemainingPercent?: number
  name: string
  windowLabel: string
  resetText: string
  isReliable: boolean
}

export function QuotaBarWithTimeline({
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
  const showQuotaFill = isReliable && boundedQuota !== undefined
  const showTime = isReliable && boundedTime !== undefined
  return (
    <div className={css.container}>
      <div className={css.labelRow}>
        <div className={css.nameGroup}>
          <span className={css.metricName} title={name}>{name}</span>
          <span className={css.windowBadge}>{windowLabel}</span>
        </div>
        <div className={css.metaGroup}>
          <span className={css.percentText} style={{ color: showQuotaFill ? quotaColor : 'var(--dsw-alias-label-tertiary, #94a3b8)' }}>
            {showQuotaFill && boundedQuota !== undefined ? `${String(Math.round(boundedQuota))}%` : '未知'}
          </span>
          <span className={css.resetTime}>{resetText}</span>
        </div>
      </div>
      <div className={css.track}>
        {showQuotaFill && boundedQuota !== undefined && (
          <div className={css.quotaFill} style={{ width: `${String(boundedQuota)}%`, backgroundColor: quotaColor }} />
        )}
        {showTime && boundedTime !== undefined && (
          <div className={css.timelineMarker} style={{ left: `${String(boundedTime)}%` }} title={`时间窗口剩余: ${String(Math.round(boundedTime))}%`}>
            <div className={css.needleArrow} style={{ borderTopColor: quotaColor }} />
            <div className={css.needleLine} style={{ background: quotaColor }} />
          </div>
        )}
      </div>
      {showTime && boundedTime !== undefined && (
        <div className={css.legendRow}>
          <span className={css.legendItem}>
            <span className={css.quotaDot} style={{ backgroundColor: quotaColor }} />
            额度剩余 {String(Math.round(boundedQuota ?? 0))}%
          </span>
          <span className={css.legendItem}>
            <span className={css.timeDot} style={{ background: quotaColor }} />
            时间窗口剩余 {String(Math.round(boundedTime))}%
          </span>
        </div>
      )}
    </div>
  )
}

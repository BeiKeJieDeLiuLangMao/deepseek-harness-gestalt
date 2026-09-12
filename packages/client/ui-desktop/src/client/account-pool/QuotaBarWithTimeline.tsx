/** Quota remaining fill with a time-window needle. */
import css from './QuotaBarWithTimeline.module.css'

export interface QuotaBarWithTimelineProps {
  percentRemaining?: number
  timeRemainingPercent?: number
  name: string
  resetText: string
  unknownLabel: string
  timeRemainingLabel?: string
  isReliable: boolean
  refreshing?: boolean
}

export function QuotaBarWithTimeline({
  percentRemaining,
  timeRemainingPercent,
  name,
  resetText,
  unknownLabel,
  timeRemainingLabel,
  isReliable,
  refreshing = false,
}: QuotaBarWithTimelineProps) {
  const boundedQuota = percentRemaining === undefined ? undefined : Math.max(0, Math.min(100, percentRemaining))
  const boundedTime = timeRemainingPercent === undefined ? undefined : Math.max(0, Math.min(100, timeRemainingPercent))
  const quotaColor = boundedQuota === undefined || boundedQuota === 0
    ? 'var(--dsw-alias-state-error-primary)'
    : boundedQuota < 30
      ? 'var(--dsw-alias-state-error-primary)'
      : boundedQuota < 70
        ? 'var(--dsw-alias-state-warn-primary)'
        : 'var(--dsw-alias-state-success-primary)'
  const quotaFill = isReliable ? boundedQuota : undefined
  const timeFill = isReliable ? boundedTime : undefined
  return (
    <div className={`${css.container} ${refreshing ? css.refreshing : ''}`}>
      <div className={css.labelRow}>
        <span className={css.metricName} title={name}>{name}</span>
        <div className={css.metaGroup}>
          <span className={css.percentText} style={{ color: quotaFill === undefined ? 'var(--dsw-alias-label-tertiary)' : quotaColor }}>
            {quotaFill === undefined ? unknownLabel : `${String(Math.round(quotaFill))}%`}
          </span>
          {resetText.length > 0 && <span className={css.resetTime}>{resetText}</span>}
        </div>
      </div>
      <div className={css.track}>
        {quotaFill !== undefined && (
          <div className={css.quotaFill} style={{ width: `${String(quotaFill)}%`, backgroundColor: quotaColor }} />
        )}
        {timeFill !== undefined && (
          <div className={css.timelineMarker} style={{ left: `${String(timeFill)}%` }} title={timeRemainingLabel ?? `${String(Math.round(timeFill))}%`}>
            <div className={css.needleArrow} style={{ borderTopColor: quotaColor }} />
            <div className={css.needleLine} style={{ background: quotaColor }} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * QuotaBarWithTimeline:
 * Dual-track visual comparison matching User Screenshot 3 & 4 and Manager QuotaTimeline logic.
 * Tracks quota remaining % and overlays a time remaining % marker/range.
 */

import css from './QuotaBarWithTimeline.module.css'

export interface QuotaBarWithTimelineProps {
  key?: string
  percentRemaining: number // 0-100
  timeRemainingPercent?: number | undefined // 0-100
  name: string
  windowLabel: string
  resetText: string
  isReliable: boolean
  isExceeded?: boolean | undefined
  styleVariant?: 'needle' | 'band' | 'compact' | undefined
}

export function QuotaBarWithTimeline({
  percentRemaining,
  timeRemainingPercent,
  name,
  windowLabel,
  resetText,
  isReliable,
  isExceeded,
  styleVariant = 'needle',
}: QuotaBarWithTimelineProps) {
  const boundedQuota = Math.max(0, Math.min(100, percentRemaining))
  const boundedTime = timeRemainingPercent !== undefined
    ? Math.max(0, Math.min(100, timeRemainingPercent))
    : undefined

  // Match manager CPAMC QuotaMeter threshold rules (≥70 green, ≥30 amber, <30 red)
  const quotaColor = isExceeded || boundedQuota === 0
    ? 'var(--dsw-alias-state-error-primary, #ef4444)'
    : boundedQuota < 30
      ? 'var(--dsw-alias-state-error-primary, #ef4444)'
      : boundedQuota < 70
        ? 'var(--dsw-alias-state-warning-primary, #f59e0b)'
        : 'var(--dsw-alias-state-success-primary, #10b981)'

  // Quota is reliable?
  const showQuotaFill = isReliable
  // Time is reliable only when timeRemainingPercent is provided AND isReliable is true
  const showTime = isReliable && boundedTime !== undefined

  return (
    <div className={css.container}>
      <div className={css.labelRow}>
        <div className={css.nameGroup}>
          <span className={css.metricName} title={name}>{name}</span>
          <span className={css.windowBadge}>{windowLabel}</span>
        </div>
        <div className={css.metaGroup}>
          <span className={css.percentText} style={{ color: isReliable ? quotaColor : 'var(--dsw-alias-label-tertiary, #94a3b8)' }}>
            {isReliable ? `${boundedQuota}%` : '未知'}
          </span>
          <span className={css.resetTime}>{resetText}</span>
        </div>
      </div>

      <div className={css.track}>
        {/* Fill representing quota remaining - rendered only when reliable */}
        {showQuotaFill && (
          <div
            className={css.quotaFill}
            style={{
              width: `${String(boundedQuota)}%`,
              backgroundColor: quotaColor,
            }}
          />
        )}

        {/* Time comparison overlay: Needle marker (Figure 4) - rendered only when time data is reliable */}
        {showTime && boundedTime !== undefined && styleVariant === 'needle' && (
          <div
            className={css.timelineMarker}
            style={{ left: `${String(boundedTime)}%` }}
            title={`时间窗口剩余: ${String(boundedTime)}%`}
          >
            <div className={css.needleArrow} />
            <div className={css.needleLine} />
          </div>
        )}

        {/* Time comparison overlay: Band range - rendered only when time data is reliable */}
        {showTime && boundedTime !== undefined && styleVariant === 'band' && (
          <div
            className={css.timelineBand}
            style={{ width: `${String(boundedTime)}%` }}
            title={`时间窗口剩余: ${String(boundedTime)}%`}
          />
        )}
      </div>

      {showTime && boundedTime !== undefined && (
        <div className={css.legendRow}>
          <span className={css.legendItem}>
            <span className={css.quotaDot} style={{ backgroundColor: quotaColor }} />
            额度剩余 {boundedQuota}%
          </span>
          <span className={css.legendItem}>
            <span className={css.timeDot} />
            时间窗口剩余 {boundedTime}%
          </span>
        </div>
      )}
    </div>
  )
}

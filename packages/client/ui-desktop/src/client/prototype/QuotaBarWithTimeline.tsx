/**
 * QuotaBarWithTimeline:
 * Dual-track visual comparison matching User Screenshot 3 & 4.
 * Tracks quota remaining % and overlays a time remaining % marker/range.
 */

import css from './QuotaBarWithTimeline.module.css'

export interface QuotaBarWithTimelineProps {
  percentRemaining: number // 0-100
  timeRemainingPercent?: number // 0-100
  name: string
  windowLabel: string
  resetText: string
  isReliable: boolean
  isExceeded?: boolean
  styleVariant?: 'needle' | 'band' | 'compact'
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

  // Color gradient/tone depending on health
  const quotaColor = isExceeded || boundedQuota === 0
    ? 'var(--dsw-alias-state-error-primary, #ef4444)'
    : boundedQuota < 20
      ? 'var(--dsw-alias-state-warning-primary, #f59e0b)'
      : 'var(--dsw-alias-state-success-primary, #10b981)'

  return (
    <div className={css.container}>
      <div className={css.labelRow}>
        <div className={css.nameGroup}>
          <span className={css.metricName} title={name}>{name}</span>
          <span className={css.windowBadge}>{windowLabel}</span>
        </div>
        <div className={css.metaGroup}>
          <span className={css.percentText} style={{ color: quotaColor }}>
            {isReliable ? `${boundedQuota}%` : '未知'}
          </span>
          <span className={css.resetTime}>{resetText}</span>
        </div>
      </div>

      <div className={css.track}>
        {/* Fill representing quota remaining */}
        <div
          className={css.quotaFill}
          style={{
            width: `${String(boundedQuota)}%`,
            backgroundColor: quotaColor,
          }}
        />

        {/* Time comparison overlay */}
        {boundedTime !== undefined && styleVariant === 'needle' && (
          <div
            className={css.timelineMarker}
            style={{ left: `${String(boundedTime)}%` }}
            title={`时间窗口剩余: ${String(boundedTime)}%`}
          >
            <div className={css.needleArrow} />
            <div className={css.needleLine} />
          </div>
        )}

        {boundedTime !== undefined && styleVariant === 'band' && (
          <div
            className={css.timelineBand}
            style={{ width: `${String(boundedTime)}%` }}
            title={`时间窗口剩余: ${String(boundedTime)}%`}
          />
        )}
      </div>

      {boundedTime !== undefined && (
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

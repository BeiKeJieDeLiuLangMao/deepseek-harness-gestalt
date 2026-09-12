/** Dual-face account card: management on A, quota on B. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopAccountPoolAccount } from '../../protocol.ts'
import { quotaPlanLabel, quotaResetText, visibleQuotaWindows, type AccountPoolCopy, type VisibleQuotaWindow } from './quota-display.ts'
import { ProviderIcon, providerDisplayName } from './ProviderIcon.tsx'
import { QuotaBarWithTimeline } from './QuotaBarWithTimeline.tsx'
import css from './AccountCard.module.css'

export interface AccountCardProps {
  t: AccountPoolCopy
  item: DesktopAccountPoolAccount
  globalFace: 'A' | 'B'
  globalEpoch: number
  refreshingQuota?: boolean
  refreshingRoster?: boolean
  onToggleStatus: (name: string, enabled: boolean) => void
  onRefreshQuota: (authIndex: string) => void
  onDelete: (name: string) => void
  onListModels: (name: string) => void
  onRefresh: () => void
  onDownload: (name: string) => void
  onEditSettings: (account: DesktopAccountPoolAccount) => void
}

export function AccountCard({
  t, item, globalFace, globalEpoch, refreshingQuota = false, refreshingRoster = false,
  onToggleStatus, onRefreshQuota, onDelete,
  onListModels, onRefresh, onDownload, onEditSettings,
}: AccountCardProps) {
  const [localOverride, setLocalOverride] = useState<'A' | 'B' | null>(null)
  useEffect(() => { setLocalOverride(null) }, [globalEpoch])
  const currentFace = localOverride ?? globalFace
  const flipFace = (): void => { setLocalOverride(currentFace === 'A' ? 'B' : 'A') }
  const quotaWindows = visibleQuotaWindows(item.quota, t)
  return (
    <div className={`${css.card} ${item.enabled ? '' : css.cardDisabled}`} data-testid={`account-card-${item.authIndex}`} data-current-face={currentFace}>
      <div className={css.cardTop}>
        <div className={css.providerBadge}>
          <span className={css.providerIcon}><ProviderIcon provider={item.provider} /></span>
          <div className={css.titleBox}>
            <strong className={css.filename} title={item.name}>{item.name}</strong>
            <span className={css.providerLabel}>{providerDisplayName(item.provider)} · {item.label}</span>
          </div>
        </div>
        <div className={css.topRightActions}>
          <button type="button" className={css.faceFlipBtn} onClick={flipFace} data-testid={`card-flip-btn-${item.authIndex}`}>
            {currentFace === 'A' ? t('sub2api.flipToQuota') : t('sub2api.flipToManage')}
          </button>
          <span className={`${css.statusBadge} ${item.enabled ? css.status_active : css.status_expired}`}>
            {item.enabled ? t('sub2api.enabled') : t('sub2api.disabled')}
          </span>
        </div>
      </div>
      {currentFace === 'A' && (
        <div className={css.faceA} data-testid="card-face-a">
          {item.statusMessage !== undefined && item.statusMessage.length > 0 && <div className={css.alertBanner}>{item.statusMessage}</div>}
          <div className={css.healthSection}>
            <div className={css.healthHeader}>
              <span>{t('sub2api.health')}</span>
              <span>{t('sub2api.successFail', { success: item.successCount, fail: item.failCount })}</span>
            </div>
            <div className={css.healthTicks} data-testid={`health-ticks-${item.authIndex}`}>
              {healthTicks(item.recentRequests).map((tick, index) => (
                <span key={index} className={`${css.tick} ${tick === 'pass' ? css.tickPass : tick === 'fail' ? css.tickFail : css.tickEmpty}`} />
              ))}
            </div>
          </div>
          <div className={css.metaFooter}>
            <span className={css.dateText}>{formatMeta(item.sizeBytes, item.modifiedAt ?? item.createdAt)}</span>
            <div className={css.footerActions}>
              <button type="button" className={css.iconBtn} title={t('sub2api.models')} aria-label={t('sub2api.models')} onClick={() => { onListModels(item.name) }}>{t('sub2api.models')}</button>
              <button type="button" className={`${css.iconBtn} ${refreshingRoster ? css.spinning : ''}`} title={t('sub2api.refresh')} aria-label={t('sub2api.refresh')} onClick={onRefresh}>↻</button>
              <button type="button" className={css.iconBtn} title={t('sub2api.download')} aria-label={t('sub2api.download')} onClick={() => { onDownload(item.name) }}>↓</button>
              <button type="button" className={css.iconBtn} title={t('sub2api.settings')} aria-label={t('sub2api.settings')} onClick={() => { onEditSettings(item) }}>⚙</button>
              <button type="button" className={css.iconBtn} title={t('sub2api.delete')} aria-label={t('sub2api.delete')} onClick={() => { onDelete(item.name) }}>🗑</button>
              <label className={css.switchLabel}>
                <input type="checkbox" checked={item.enabled} onChange={() => { onToggleStatus(item.name, !item.enabled) }} className={css.toggleInput} />
                <span className={css.toggleSlider} />
              </label>
            </div>
          </div>
        </div>
      )}
      {currentFace === 'B' && (
        <div className={css.faceB} data-testid="card-face-b">
          {quotaWindows.length === 0 ? (
            <div className={css.emptyQuota}>
              <p>{t('sub2api.emptyQuota')}</p>
              <Button size="sm" variant="primary" onClick={() => { onRefreshQuota(item.authIndex) }}>{t('sub2api.probeNow')}</Button>
            </div>
          ) : (
            <div className={css.quotaList}>
              {quotaPlanLabel(item.planType) !== undefined && (
                <div className={css.planRow}>
                  <span>{t('sub2api.plan')}</span>
                  <span className={css.planChip}>{quotaPlanLabel(item.planType)}</span>
                  {item.resetCreditsAvailable !== undefined && (
                    <span className={css.planMeta}>{t('sub2api.resetCredits', { count: item.resetCreditsAvailable })}</span>
                  )}
                </div>
              )}
              {groupedQuotaWindows(quotaWindows).map(group => (
                <section key={group.title ?? 'ungrouped'} className={css.quotaGroup}>
                  {group.title !== undefined && <h4 className={css.groupTitle}>{group.title}</h4>}
                  {group.description !== undefined && <p className={css.groupHint}>{group.description}</p>}
                  {group.windows.map(window => (
                    <QuotaBarWithTimeline
                      key={window.key}
                      name={window.title}
                      resetText={quotaResetText(window.resetAtMs, t)}
                      unknownLabel={t('sub2api.unknown')}
                      {...window.timeRemainingPercent === undefined ? {} : { timeRemainingLabel: t('sub2api.timeRemaining', { percent: Math.round(Math.max(0, Math.min(100, window.timeRemainingPercent))) }) }}
                      isReliable={window.status === 'known' && window.remainingPercent !== undefined}
                      refreshing={refreshingQuota}
                      {...window.remainingPercent === undefined ? {} : { percentRemaining: window.remainingPercent }}
                      {...window.timeRemainingPercent === undefined ? {} : { timeRemainingPercent: window.timeRemainingPercent }}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
          <div className={css.quotaFooter}>
            <div className={css.footerActions}>
              <Button
                size="sm"
                variant="ghost"
                aria-busy={refreshingQuota}
                icon={<span className={refreshingQuota ? css.spinning : undefined} aria-hidden>↻</span>}
                onClick={() => { onRefreshQuota(item.authIndex) }}
              >
                {t('sub2api.refreshQuota')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function groupedQuotaWindows(windows: readonly VisibleQuotaWindow[]): readonly {
  readonly title?: string
  readonly description?: string
  readonly windows: readonly VisibleQuotaWindow[]
}[] {
  const groups: { title?: string; description?: string; windows: VisibleQuotaWindow[] }[] = []
  for (const window of windows) {
    const last = groups.at(-1)
    if (last !== undefined && last.title === window.group) {
      last.windows.push(window)
      continue
    }
    groups.push({
      ...window.group === undefined ? {} : { title: window.group },
      ...window.groupDescription === undefined ? {} : { description: window.groupDescription },
      windows: [window],
    })
  }
  return groups
}

function healthTicks(recent: DesktopAccountPoolAccount['recentRequests']): readonly ('pass' | 'fail' | 'empty')[] {
  const source = recent ?? []
  const buckets = source.length >= 20
    ? source.slice(-20)
    : [...Array.from({ length: 20 - source.length }, () => ({ success: 0, failed: 0 })), ...source]
  return buckets.map((bucket) => {
    if (bucket.failed > 0) return 'fail'
    if (bucket.success > 0) return 'pass'
    return 'empty'
  })
}

function formatMeta(sizeBytes: number | undefined, stamp: string | undefined): string {
  const size = sizeBytes === undefined
    ? ''
    : sizeBytes >= 1024
      ? `${(sizeBytes / 1024).toFixed(2)} KB`
      : `${sizeBytes.toFixed(2)} B`
  const shown = formatStamp(stamp)
  if (size.length === 0) return shown ?? ''
  if (shown === undefined) return size
  return `${size} · ${shown}`
}

function formatStamp(stamp: string | undefined): string | undefined {
  if (stamp === undefined || stamp.length === 0) return undefined
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return stamp
  return `${String(date.getFullYear())}/${String(date.getMonth() + 1)}/${String(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Dual-face account card: management on A, quota on B. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopAccountPoolAccount } from '../../protocol.ts'
import { QuotaBarWithTimeline } from './QuotaBarWithTimeline.tsx'
import css from './AccountCard.module.css'

type DesktopCopy = PropsLocale<'desktop'>['t']

export interface AccountCardProps {
  t: DesktopCopy
  item: DesktopAccountPoolAccount
  globalFace: 'A' | 'B'
  globalEpoch: number
  onToggleStatus: (name: string, enabled: boolean) => void
  onRefreshQuota: (authIndex: string) => void
  onDelete: (name: string) => void
}

export function AccountCard({
  t, item, globalFace, globalEpoch, onToggleStatus, onRefreshQuota, onDelete,
}: AccountCardProps) {
  const [localOverride, setLocalOverride] = useState<'A' | 'B' | null>(null)
  useEffect(() => { setLocalOverride(null) }, [globalEpoch])
  const currentFace = localOverride ?? globalFace
  const flipFace = (): void => { setLocalOverride(currentFace === 'A' ? 'B' : 'A') }
  return (
    <div className={`${css.card} ${item.enabled ? '' : css.cardDisabled}`} data-testid={`account-card-${item.authIndex}`} data-current-face={currentFace}>
      <div className={css.cardTop}>
        <div className={css.providerBadge}>
          <span className={css.providerIcon}>{providerGlyph(item.provider)}</span>
          <div className={css.titleBox}>
            <strong className={css.filename} title={item.name}>{item.name}</strong>
            <span className={css.providerLabel}>{item.provider.toUpperCase()} · {item.label}</span>
          </div>
        </div>
        <div className={css.topRightActions}>
          <button type="button" className={css.faceFlipBtn} onClick={flipFace} data-testid={`card-flip-btn-${item.authIndex}`}>
            {currentFace === 'A' ? t('pool.flip.quota') : t('pool.flip.manage')}
          </button>
          <span className={`${css.statusBadge} ${item.enabled ? css.status_active : css.status_expired}`}>
            {item.enabled ? t('pool.status.enabled') : t('pool.status.disabled')}
          </span>
        </div>
      </div>
      {currentFace === 'A' && (
        <div className={css.faceA} data-testid="card-face-a">
          {item.statusMessage !== undefined && <div className={css.alertBanner}>{item.statusMessage}</div>}
          <div className={css.statsRow}>
            <div className={css.statCol}>
              <span className={css.statLabel}>{t('pool.subject')}</span>
              <strong className={css.statValue}>{item.email ?? item.label}</strong>
            </div>
            <div className={css.statCol}>
              <span className={css.statLabel}>{t('pool.stats')}</span>
              <div className={css.reqCount}>
                <span className={css.successNum}>{t('pool.success').replace('{count}', String(item.successCount))}</span>
                <span className={css.failNum}>{t('pool.failure').replace('{count}', String(item.failCount))}</span>
              </div>
            </div>
          </div>
          <div className={css.metaFooter}>
            <span className={css.dateText}>{item.createdAt ?? ''}</span>
            <div className={css.footerActions}>
              <Button size="sm" variant="outline" onClick={() => { onDelete(item.name) }}>{t('pool.delete')}</Button>
              <Button size="sm" variant="ghost" onClick={flipFace}>{t('pool.viewQuota')}</Button>
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
          {item.quota.length === 0 ? (
            <div className={css.emptyQuota}>
              <p>{t('pool.quota.empty')}</p>
              <Button size="sm" variant="primary" onClick={() => { onRefreshQuota(item.authIndex) }}>{t('pool.quota.probe')}</Button>
            </div>
          ) : (
            <div className={css.quotaList}>
              {item.quota.map(window => (
                <QuotaBarWithTimeline
                  key={window.key}
                  t={t}
                  name={window.label}
                  windowLabel={window.label}
                  resetText={window.status === 'known' ? t('pool.quota.observed') : window.status}
                  isReliable={window.status === 'known' && window.remainingPercent !== undefined}
                  {...window.remainingPercent === undefined ? {} : { percentRemaining: window.remainingPercent }}
                  {...window.timeRemainingPercent === undefined ? {} : { timeRemainingPercent: window.timeRemainingPercent }}
                />
              ))}
            </div>
          )}
          <div className={css.quotaFooter}>
            <span className={css.quotaHint}>{t('pool.quota.hint')}</span>
            <div className={css.footerActions}>
              <Button size="sm" variant="ghost" onClick={() => { onRefreshQuota(item.authIndex) }}>{t('pool.quota.refresh')}</Button>
              <Button size="sm" variant="outline" onClick={flipFace}>{t('pool.quota.back')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function providerGlyph(provider: string): string {
  switch (provider) {
    case 'kimi': return 'K'
    case 'codex': return '⚡'
    case 'anthropic': case 'claude': return '✳'
    case 'antigravity': return '▲'
    case 'xai': return 'Ø'
    case 'glm': return '◈'
    default: return '●'
  }
}

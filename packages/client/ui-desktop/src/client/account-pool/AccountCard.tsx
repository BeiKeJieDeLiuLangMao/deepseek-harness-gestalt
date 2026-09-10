/** Dual-face account card: management on A, quota on B. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopAccountPoolAccount } from '../../protocol.ts'
import { QuotaBarWithTimeline } from './QuotaBarWithTimeline.tsx'
import css from './AccountCard.module.css'

export interface AccountCardProps {
  item: DesktopAccountPoolAccount
  globalFace: 'A' | 'B'
  globalEpoch: number
  onToggleStatus: (name: string, enabled: boolean) => void
  onRefreshQuota: (authIndex: string) => void
  onDelete: (name: string) => void
}

export function AccountCard({
  item, globalFace, globalEpoch, onToggleStatus, onRefreshQuota, onDelete,
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
            {currentFace === 'A' ? '⇄ 额度面' : '⇄ 管理面'}
          </button>
          <span className={`${css.statusBadge} ${item.enabled ? css.status_active : css.status_expired}`}>
            {item.enabled ? '启用' : '停用'}
          </span>
        </div>
      </div>
      {currentFace === 'A' && (
        <div className={css.faceA} data-testid="card-face-a">
          {item.statusMessage !== undefined && <div className={css.alertBanner}>{item.statusMessage}</div>}
          <div className={css.statsRow}>
            <div className={css.statCol}>
              <span className={css.statLabel}>账号主体</span>
              <strong className={css.statValue}>{item.email ?? item.label}</strong>
            </div>
            <div className={css.statCol}>
              <span className={css.statLabel}>调用统计</span>
              <div className={css.reqCount}>
                <span className={css.successNum}>成功 {item.successCount}</span>
                <span className={css.failNum}>失败 {item.failCount}</span>
              </div>
            </div>
          </div>
          <div className={css.metaFooter}>
            <span className={css.dateText}>{item.createdAt ?? ''}</span>
            <div className={css.footerActions}>
              <Button size="sm" variant="outline" onClick={() => { onDelete(item.name) }}>删除</Button>
              <Button size="sm" variant="ghost" onClick={flipFace}>查看配额</Button>
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
              <p>暂未获取到该账号配额数据，或该提供商不提供主动额度查询。</p>
              <Button size="sm" variant="primary" onClick={() => { onRefreshQuota(item.authIndex) }}>立即探测刷新</Button>
            </div>
          ) : (
            <div className={css.quotaList}>
              {item.quota.map(window => (
                <QuotaBarWithTimeline
                  key={window.key}
                  name={window.label}
                  windowLabel={window.label}
                  resetText={window.status === 'known' ? '已观测' : window.status}
                  isReliable={window.status === 'known' && window.remainingPercent !== undefined}
                  {...window.remainingPercent === undefined ? {} : { percentRemaining: window.remainingPercent }}
                  {...window.timeRemainingPercent === undefined ? {} : { timeRemainingPercent: window.timeRemainingPercent }}
                />
              ))}
            </div>
          )}
          <div className={css.quotaFooter}>
            <span className={css.quotaHint}>同轴对比：色条为额度剩余，针为本周期剩余时间；未知窗口不绘制精确比例。</span>
            <div className={css.footerActions}>
              <Button size="sm" variant="ghost" onClick={() => { onRefreshQuota(item.authIndex) }}>刷新额度</Button>
              <Button size="sm" variant="outline" onClick={flipFace}>返回管理</Button>
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

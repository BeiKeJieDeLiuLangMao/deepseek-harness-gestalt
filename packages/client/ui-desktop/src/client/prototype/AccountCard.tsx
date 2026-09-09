/**
 * AccountCard:
 * High-fidelity representation of a credential item with A/B face flipping.
 * Face A: Management (Status, success/fail counts, health history, actions, toggle)
 * Face B: Quota (Window metrics, percent remaining, timeline comparison marker)
 */

import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountPoolItem } from './mock-data.ts'
import { QuotaBarWithTimeline } from './QuotaBarWithTimeline.tsx'
import css from './AccountCard.module.css'

export interface AccountCardProps {
  key?: string
  item: AccountPoolItem
  forcedFace?: 'A' | 'B' | null | undefined
  styleVariant?: 'needle' | 'band' | 'compact' | undefined
  onToggleStatus?: ((id: string) => void) | undefined
  onRefreshQuota?: ((id: string) => void) | undefined
  onDelete?: ((id: string) => void) | undefined
}

export function AccountCard({
  item,
  forcedFace = null,
  styleVariant = 'needle',
  onToggleStatus,
  onRefreshQuota,
  onDelete,
}: AccountCardProps) {
  // Internal face state if not forced globally
  const [localFace, setLocalFace] = useState<'A' | 'B'>('A')
  const [enabled, setEnabled] = useState(item.status !== 'expired' && item.status !== 'error')

  const currentFace = forcedFace !== null ? forcedFace : localFace

  const flipFace = () => {
    setLocalFace(prev => (prev === 'A' ? 'B' : 'A'))
  }

  const handleToggle = () => {
    const next = !enabled
    setEnabled(next)
    onToggleStatus?.(item.id)
  }

  return (
    <div className={`${css.card} ${!enabled ? css.cardDisabled : ''}`}>
      {/* Top bar: Provider Icon, filename, and face flip button */}
      <div className={css.cardTop}>
        <div className={css.providerBadge}>
          <span className={css.providerIcon}>{getProviderGlyph(item.provider)}</span>
          <div className={css.titleBox}>
            <strong className={css.filename} title={item.filename}>{item.filename}</strong>
            <span className={css.providerLabel}>{item.provider.toUpperCase()} · {item.tier}</span>
          </div>
        </div>

        <div className={css.topRightActions}>
          <button
            type="button"
            className={css.faceFlipBtn}
            onClick={flipFace}
            title={currentFace === 'A' ? '切换到配额面 (B面)' : '切换到管理面 (A面)'}
          >
            {currentFace === 'A' ? '⇄ 额度面' : '⇄ 管理面'}
          </button>
          <span className={`${css.statusBadge} ${css[`status_${item.status}`]}`}>
            {getStatusLabel(item.status)}
          </span>
        </div>
      </div>

      {/* CARD BODY: A FACE (Management) */}
      {currentFace === 'A' && (
        <div className={css.faceA}>
          {item.statusMessage && (
            <div className={css.alertBanner}>
              {item.statusMessage}
            </div>
          )}

          <div className={css.statsRow}>
            <div className={css.statCol}>
              <span className={css.statLabel}>账号主体</span>
              <strong className={css.statValue}>{item.accountEmail}</strong>
            </div>
            <div className={css.statCol}>
              <span className={css.statLabel}>调用统计</span>
              <div className={css.reqCount}>
                <span className={css.successNum}>成功 {item.successCount}</span>
                <span className={css.failNum}>失败 {item.failCount}</span>
              </div>
            </div>
          </div>

          <div className={css.healthSection}>
            <div className={css.healthHeader}>
              <span>健康状态历史 (最近20次调用)</span>
              <span className={css.healthRate}>
                {item.successCount + item.failCount > 0
                  ? `${String(Math.round((item.successCount / (item.successCount + item.failCount)) * 100))}%`
                  : '--'}
              </span>
            </div>
            <div className={css.healthTicks}>
              {Array.from({ length: 20 }).map((_, i) => {
                const tick = item.healthHistory[i]
                return (
                  <span
                    key={i}
                    className={`${css.tick} ${
                      tick === true ? css.tickPass : tick === false ? css.tickFail : css.tickEmpty
                    }`}
                  />
                )
              })}
            </div>
          </div>

          <div className={css.metaFooter}>
            <span className={css.dateText}>创建时间: {item.createdAt}</span>
            <div className={css.footerActions}>
              <Button size="sm" variant="outline" onClick={() => { onDelete?.(item.id) }}>删除</Button>
              <Button size="sm" variant="ghost" onClick={flipFace}>查看配额</Button>
              <label className={css.switchLabel}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={handleToggle}
                  className={css.toggleInput}
                />
                <span className={css.toggleSlider} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* CARD BODY: B FACE (Quota & Timeline Comparison) */}
      {currentFace === 'B' && (
        <div className={css.faceB}>
          {item.metrics.length === 0 ? (
            <div className={css.emptyQuota}>
              <p>暂未获取到该账号配额数据，或该提供商不提供主动额度查询。</p>
              <Button size="sm" variant="primary" onClick={() => { onRefreshQuota?.(item.id) }}>
                立即探测刷新
              </Button>
            </div>
          ) : (
            <div className={css.quotaList}>
              {item.metrics.map(m => (
                <QuotaBarWithTimeline
                  key={m.key}
                  name={m.name}
                  percentRemaining={m.percentRemaining}
                  timeRemainingPercent={m.timeRemainingPercent}
                  windowLabel={m.windowLabel}
                  resetText={m.resetText}
                  isReliable={m.isReliable}
                  isExceeded={m.isExceeded}
                  styleVariant={styleVariant}
                />
              ))}
            </div>
          )}

          <div className={css.quotaFooter}>
            <span className={css.quotaHint}>
              同轴对比：绿/黄条为额度剩余，红刻度为本周期剩余时间。
            </span>
            <div className={css.footerActions}>
              <Button size="sm" variant="ghost" onClick={() => { onRefreshQuota?.(item.id) }}>刷新额度</Button>
              <Button size="sm" variant="outline" onClick={flipFace}>返回管理</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getProviderGlyph(p: string): string {
  switch (p) {
    case 'kimi': return 'K'
    case 'codex': return '⚡'
    case 'anthropic': return '✳'
    case 'antigravity': return '▲'
    case 'xai': return 'Ø'
    case 'glm': return '◈'
    default: return '●'
  }
}

function getStatusLabel(s: string): string {
  switch (s) {
    case 'active': return '启用'
    case 'warning': return '警告'
    case 'expired': return '过期'
    case 'error': return '异常'
    default: return '未知'
  }
}

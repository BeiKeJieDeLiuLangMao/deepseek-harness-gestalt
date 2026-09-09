/**
 * CliProxyAccountPoolPrototype:
 * The fused interaction prototype mounted on Settings 'sub2api' (Account Pool) route.
 * Presents 3 distinct variants exploring density, timeline marker styling, and layout:
 * - Variant A: Balanced Grid with Needle Timeline Overlay (User screenshot 1 & 4 fused)
 * - Variant B: High-Density List with Band Timeline Comparison (Operational focus)
 * - Variant C: Card Deck with Top Metric Summary & Detailed Dual-Track (Analytical focus)
 */

import { useState } from 'react'
import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import { MOCK_ACCOUNTS, type AccountPoolItem, type ProviderType } from './mock-data.ts'
import { AccountCard } from './AccountCard.tsx'
import { LoginModal } from './LoginModal.tsx'
import { PrototypeSwitcher } from './PrototypeSwitcher.tsx'
import css from './CliProxyAccountPoolPrototype.module.css'

export type VariantKey = 'A' | 'B' | 'C'

export function CliProxyAccountPoolPrototype() {
  const [variant, setVariant] = useState<VariantKey>('A')
  const [accounts, setAccounts] = useState<AccountPoolItem[]>(MOCK_ACCOUNTS)
  const [globalFace, setGlobalFace] = useState<'A' | 'B'>('A')
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [selectedAddProvider, setSelectedAddProvider] = useState<ProviderType>('codex')
  const [showDropdown, setShowDropdown] = useState(false)

  // Filtered accounts
  const filtered = accounts.filter(acc => {
    if (filterProvider === 'all') return true
    return acc.provider === filterProvider
  })

  // Provider counts
  const counts = {
    all: accounts.length,
    kimi: accounts.filter(a => a.provider === 'kimi').length,
    codex: accounts.filter(a => a.provider === 'codex').length,
    anthropic: accounts.filter(a => a.provider === 'anthropic').length,
    antigravity: accounts.filter(a => a.provider === 'antigravity').length,
    xai: accounts.filter(a => a.provider === 'xai').length,
    glm: accounts.filter(a => a.provider === 'glm').length,
  }

  const handleCreateAccount = (newAcc: { provider: ProviderType; email: string; tier?: string | undefined }) => {
    const item: AccountPoolItem = {
      id: `${newAcc.provider}-${String(Date.now())}`,
      filename: `${newAcc.provider}-${newAcc.email}.json`,
      provider: newAcc.provider,
      label: newAcc.provider === 'glm' ? `GLM ${newAcc.tier ?? 'Coding Plan'}` : `${newAcc.provider.toUpperCase()} 新凭据`,
      accountEmail: newAcc.email,
      tier: newAcc.tier ?? 'Standard',
      status: 'active',
      successCount: 0,
      failCount: 0,
      healthHistory: [true],
      createdAt: new Date().toLocaleDateString(),
      metrics: [
        {
          key: '5h',
          name: newAcc.provider === 'glm' ? 'GLM-4 / 5.3 订阅周期额度' : '5h 初始额度',
          percentRemaining: 100,
          timeRemainingPercent: 100,
          windowLabel: newAcc.provider === 'glm' ? '周期额度' : '5h',
          resetText: '100% · 刚刚添加',
          isReliable: true,
        },
      ],
    }
    setAccounts(prev => [item, ...prev])
  }

  const handleDelete = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  const handleRefreshQuota = (id: string) => {
    setAccounts(prev => prev.map((a: AccountPoolItem) => {
      if (a.id !== id) return a
      const updated: AccountPoolItem = {
        ...a,
        status: 'active',
        statusMessage: undefined,
        metrics: a.metrics.length > 0 ? a.metrics : [
          {
            key: 'fresh-window',
            name: '主窗口限额',
            percentRemaining: 88,
            timeRemainingPercent: 65,
            windowLabel: '周限额',
            resetText: '88% · 探测已刷新',
            isReliable: true,
          },
        ],
      }
      return updated
    }))
  }

  return (
    <div className={css.prototypeHost}>
      {/* Top Banner & Kernel State: Built-in, No Offer Download needed */}
      <div className={css.kernelBar}>
        <div className={css.kernelInfo}>
          <span className={css.kernelBadge}>DESKTOP BUILT-IN</span>
          <strong className={css.kernelTitle}>CLIProxyAPI 账号池核心已就绪 (v7.2.155)</strong>
          <span className={css.kernelDesc}>
            开箱即用 Go 原生核心，内置 Composite Provider 自动注册；无需单独下载 sidecar 组件。
          </span>
        </div>
        <div className={css.kernelActions}>
          <span className={css.healthyDot} />
          <span className={css.runtimeText}>127.0.0.1:8317 · 运行正常</span>
        </div>
      </div>

      {/* Main Account Pool Workspace Header */}
      <header className={css.workspaceHeader}>
        <div className={css.headerLeft}>
          <h2 className={css.pageTitle}>认证文件与配额管理</h2>
          <div className={css.summaryCounts}>
            <span>共 {accounts.length} 个凭证</span>
            <span>·</span>
            <span className={css.countActive}>
              {accounts.filter(a => a.status === 'active').length} 个启用
            </span>
            <span>·</span>
            <span className={css.countError}>
              {accounts.filter(a => a.status === 'error' || a.status === 'warning').length} 个需关注
            </span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className={css.headerRight}>
          {/* Global Face Switcher A/B */}
          <div className={css.globalFaceSwitch}>
            <span className={css.switchTitle}>卡片视图:</span>
            <div className={css.switchGroup}>
              <button
                type="button"
                className={`${css.faceBtn} ${globalFace === 'A' ? css.faceBtnActive : ''}`}
                onClick={() => { setGlobalFace('A') }}
              >
                📋 管理面 (A面)
              </button>
              <button
                type="button"
                className={`${css.faceBtn} ${globalFace === 'B' ? css.faceBtnActive : ''}`}
                onClick={() => { setGlobalFace('B') }}
              >
                📊 额度面 (B面)
              </button>
            </div>
          </div>

          {/* Add Account Dropdown Menu */}
          <div className={css.addDropdownContainer}>
            <Button
              variant="primary"
              onClick={() => { setShowDropdown(prev => !prev) }}
            >
              + 添加账号 ▾
            </Button>
            {showDropdown && (
              <div className={css.dropdownMenu}>
                <div className={css.dropdownHeader}>选择认证提供方:</div>
                <button
                  type="button"
                  className={css.dropdownItem}
                  onClick={() => { setSelectedAddProvider('kimi'); setShowDropdown(false); setShowLoginModal(true) }}
                >
                  <span className={css.dropIcon}>K</span> Kimi OAuth (设备授权)
                </button>
                <button
                  type="button"
                  className={css.dropdownItem}
                  onClick={() => { setSelectedAddProvider('codex'); setShowDropdown(false); setShowLoginModal(true) }}
                >
                  <span className={css.dropIcon}>⚡</span> Codex OAuth
                </button>
                <button
                  type="button"
                  className={css.dropdownItem}
                  onClick={() => { setSelectedAddProvider('anthropic'); setShowDropdown(false); setShowLoginModal(true) }}
                >
                  <span className={css.dropIcon}>✳</span> Anthropic OAuth
                </button>
                <button
                  type="button"
                  className={css.dropdownItem}
                  onClick={() => { setSelectedAddProvider('antigravity'); setShowDropdown(false); setShowLoginModal(true) }}
                >
                  <span className={css.dropIcon}>▲</span> Antigravity OAuth
                </button>
                <button
                  type="button"
                  className={css.dropdownItem}
                  onClick={() => { setSelectedAddProvider('xai'); setShowDropdown(false); setShowLoginModal(true) }}
                >
                  <span className={css.dropIcon}>Ø</span> xAI Grok OAuth
                </button>
                <button
                  type="button"
                  className={css.dropdownItem}
                  onClick={() => { setSelectedAddProvider('glm'); setShowDropdown(false); setShowLoginModal(true) }}
                >
                  <span className={css.dropIcon}>◈</span> GLM Coding Plan (订阅密钥表单)
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Provider Filter Bar */}
      <div className={css.filterBar}>
        <Pill active={filterProvider === 'all'} onClick={() => { setFilterProvider('all') }}>
          全部 ({counts.all})
        </Pill>
        <Pill active={filterProvider === 'codex'} onClick={() => { setFilterProvider('codex') }}>
          ⚡ Codex ({counts.codex})
        </Pill>
        <Pill active={filterProvider === 'antigravity'} onClick={() => { setFilterProvider('antigravity') }}>
          ▲ Antigravity ({counts.antigravity})
        </Pill>
        <Pill active={filterProvider === 'anthropic'} onClick={() => { setFilterProvider('anthropic') }}>
          ✳ Anthropic ({counts.anthropic})
        </Pill>
        <Pill active={filterProvider === 'kimi'} onClick={() => { setFilterProvider('kimi') }}>
          K Kimi ({counts.kimi})
        </Pill>
        <Pill active={filterProvider === 'xai'} onClick={() => { setFilterProvider('xai') }}>
          Ø xAI ({counts.xai})
        </Pill>
        <Pill active={filterProvider === 'glm'} onClick={() => { setFilterProvider('glm') }}>
          ◈ GLM ({counts.glm})
        </Pill>
      </div>

      {/* RENDER VARIANT CONTENTS */}
      {variant === 'A' && (
        <div className={css.variantA}>
          <div className={css.cardsGrid}>
            {filtered.map(acc => (
              <AccountCard
                key={acc.id}
                item={acc}
                forcedFace={globalFace}
                styleVariant="needle"
                onDelete={handleDelete}
                onRefreshQuota={handleRefreshQuota}
              />
            ))}
          </div>
        </div>
      )}

      {variant === 'B' && (
        <div className={css.variantB}>
          <div className={css.cardsGridDense}>
            {filtered.map(acc => (
              <AccountCard
                key={acc.id}
                item={acc}
                forcedFace={globalFace}
                styleVariant="band"
                onDelete={handleDelete}
                onRefreshQuota={handleRefreshQuota}
              />
            ))}
          </div>
        </div>
      )}

      {variant === 'C' && (
        <div className={css.variantC}>
          <div className={css.overviewStrip}>
            <div className={css.overviewCard}>
              <span className={css.overviewLabel}>可用凭据总量</span>
              <strong>{accounts.length}</strong>
            </div>
            <div className={css.overviewCard}>
              <span className={css.overviewLabel}>全网流量健康度</span>
              <strong style={{ color: '#10b981' }}>99.1%</strong>
            </div>
            <div className={css.overviewCard}>
              <span className={css.overviewLabel}>当前重置窗口周期</span>
              <strong>5h / 7d 双层</strong>
            </div>
          </div>
          <div className={css.cardsGrid}>
            {filtered.map(acc => (
              <AccountCard
                key={acc.id}
                item={acc}
                forcedFace={globalFace}
                styleVariant="compact"
                onDelete={handleDelete}
                onRefreshQuota={handleRefreshQuota}
              />
            ))}
          </div>
        </div>
      )}

      {/* Login Modal Flow */}
      {showLoginModal && (
        <LoginModal
          initialProvider={selectedAddProvider}
          onClose={() => { setShowLoginModal(false) }}
          onSuccess={handleCreateAccount}
        />
      )}

      {/* Prototype Switcher Bar */}
      <PrototypeSwitcher
        current={variant}
        variants={[
          {
            id: 'A',
            label: '平衡双面网格 · 针式时间刻度',
            description: '融合截图1与截图2；同轴额度条叠加红针时间窗口剩余对比',
          },
          {
            id: 'B',
            label: '高密操作布局 · 带状时间重叠',
            description: '紧凑卡片排布；带状半透明范围展现时间窗口对比',
          },
          {
            id: 'C',
            label: '监控概览卡组 · 窗口分析强化',
            description: '顶置健康概览流；强化各模型限额与同轴刻度细化',
          },
        ]}
        onChange={v => { setVariant(v as VariantKey) }}
      />
    </div>
  )
}

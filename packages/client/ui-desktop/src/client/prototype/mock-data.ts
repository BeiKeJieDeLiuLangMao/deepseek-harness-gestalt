/**
 * Mock data fixture for CLIProxyAPI Account Pool prototype.
 * Pure in-memory fixture; no live network or real credential leakage.
 */

export type ProviderType = 'kimi' | 'codex' | 'anthropic' | 'antigravity' | 'xai' | 'glm'

export interface QuotaWindowMetric {
  key: string
  name: string
  percentRemaining: number // 0 - 100
  timeRemainingPercent?: number // 0 - 100 (optional comparison timeline)
  windowLabel: string
  resetText: string
  isReliable: boolean
  isExceeded?: boolean
}

export interface AccountPoolItem {
  id: string
  filename: string
  provider: ProviderType
  label: string
  accountEmail: string
  tier: string
  status: 'active' | 'expired' | 'warning' | 'error'
  statusMessage?: string
  successCount: number
  failCount: number
  healthHistory: boolean[] // 20-slot activity ticks (true=success, false=fail, null/empty for idle)
  createdAt: string
  metrics: QuotaWindowMetric[]
}

export const MOCK_ACCOUNTS: AccountPoolItem[] = [
  {
    id: 'antigravity-1',
    filename: 'antigravity-canassavitsky@gmail.com.json',
    provider: 'antigravity',
    label: 'Antigravity Pro Primary',
    accountEmail: 'canassavitsky@gmail.com',
    tier: 'Pro',
    status: 'error',
    statusMessage: '额度获取失败: auth token refresh failed',
    successCount: 0,
    failCount: 0,
    healthHistory: [],
    createdAt: '2026/9/5 23:53:29',
    metrics: [],
  },
  {
    id: 'antigravity-2',
    filename: 'antigravity-cy517375685@gmail.com.json',
    provider: 'antigravity',
    label: 'Antigravity Workspace',
    accountEmail: 'cy517375685@gmail.com',
    tier: 'Pro',
    status: 'active',
    successCount: 2270,
    failCount: 5,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true, true, false, true, true],
    createdAt: '2026/9/10 01:26:35',
    metrics: [
      {
        key: '5h',
        name: 'Five Hour Limit Remaining',
        percentRemaining: 93,
        timeRemainingPercent: 46, // 2h 17m out of 5h
        windowLabel: '5h',
        resetText: '剩余 93% · 2 小时 17 分钟 后刷新',
        isReliable: true,
      },
      {
        key: '7d',
        name: 'Weekly Limit Remaining',
        percentRemaining: 59,
        timeRemainingPercent: 20, // ~1d 9h out of 7d
        windowLabel: '周限额',
        resetText: '剩余 59% · 1 天 9 小时 后刷新',
        isReliable: true,
      },
      {
        key: 'claude-5h',
        name: 'Claude / GPT 5h Limit',
        percentRemaining: 100,
        timeRemainingPercent: 95,
        windowLabel: '5h',
        resetText: '额度可用 · 4 小时 47 分钟 后刷新',
        isReliable: true,
      },
      {
        key: 'claude-7d',
        name: 'Claude / GPT Weekly Limit',
        percentRemaining: 100,
        timeRemainingPercent: 98,
        windowLabel: '周限额',
        resetText: '额度可用 · 6 天 23 小时 后刷新',
        isReliable: true,
      },
    ],
  },
  {
    id: 'codex-1',
    filename: 'codex-a7724509-wangcc613@gmail.com-pro.json',
    provider: 'codex',
    label: 'Codex 20x Dev Pool',
    accountEmail: 'wangcc613@gmail.com',
    tier: 'Pro 20x',
    status: 'active',
    successCount: 7217,
    failCount: 54,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, false],
    createdAt: '2026/9/10 01:10:41',
    metrics: [
      {
        key: 'weekly',
        name: '周限额',
        percentRemaining: 77,
        timeRemainingPercent: 71, // 5 days out of 7 days (~71%)
        windowLabel: '7d 窗口',
        resetText: '77% · 09/15 02:32 · 5天后',
        isReliable: true,
      },
      {
        key: 'spark-5h',
        name: 'GPT-5.3-Codex-Spark 5h',
        percentRemaining: 100,
        timeRemainingPercent: 80,
        windowLabel: '5h 窗口',
        resetText: '100% · 09/10 06:25 · 4小时后',
        isReliable: true,
      },
      {
        key: 'spark-7d',
        name: 'GPT-5.3-Codex-Spark 周限额',
        percentRemaining: 100,
        timeRemainingPercent: 85,
        windowLabel: '7d 窗口',
        resetText: '100% · 09/17 01:25 · 6天后',
        isReliable: true,
      },
      {
        key: 'reserve-7d',
        name: 'gpt-reserve 周限额',
        percentRemaining: 100,
        timeRemainingPercent: 85,
        windowLabel: '7d 窗口',
        resetText: '100% · 09/17 01:25 · 6天后',
        isReliable: true,
      },
    ],
  },
  {
    id: 'kimi-1',
    filename: 'kimi-1788455448854.json',
    provider: 'kimi',
    label: 'Kimi Research Seat',
    accountEmail: 'kimi-account-01@domain.com',
    tier: 'Standard',
    status: 'active',
    successCount: 1443,
    failCount: 11,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true],
    createdAt: '2026/9/10 02:17:00',
    metrics: [
      {
        key: '5h-window',
        name: '5h 限额',
        percentRemaining: 100,
        timeRemainingPercent: 40,
        windowLabel: '5h 窗口',
        resetText: '100% · 09/10 02:17',
        isReliable: true,
      },
    ],
  },
  {
    id: 'xai-1',
    filename: 'xai-cy517375685@gmail.com.json',
    provider: 'xai',
    label: 'xAI Grok Subscription',
    accountEmail: 'cy517375685@gmail.com',
    tier: 'Premium',
    status: 'warning',
    statusMessage: '周限额已用完，等待窗口刷新',
    successCount: 8225,
    failCount: 116,
    healthHistory: [true, true, true, true, true, false, true, true, true, true],
    createdAt: '2026/9/9 23:04:03',
    metrics: [
      {
        key: 'xai-weekly',
        name: '周限额',
        percentRemaining: 0,
        timeRemainingPercent: 9, // 重置时间 13小时后 (~8%)
        windowLabel: '周限额',
        resetText: '已用 100% · 重置 09/10 15:00 · 13小时后',
        isReliable: true,
        isExceeded: true,
      },
    ],
  },
  {
    id: 'anthropic-1',
    filename: 'anthropic-team-primary.json',
    provider: 'anthropic',
    label: 'Claude Team Workstation',
    accountEmail: 'anthropic-team@studio.dev',
    tier: 'Team',
    status: 'active',
    successCount: 3105,
    failCount: 2,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true],
    createdAt: '2026/9/8 14:20:11',
    metrics: [
      {
        key: 'claude-sonnet',
        name: 'Claude 3.5 Sonnet / Opus 窗口',
        percentRemaining: 68,
        timeRemainingPercent: 55,
        windowLabel: '5h 窗口',
        resetText: '剩余 68% · 2 小时 45 分钟后刷新',
        isReliable: true,
      },
    ],
  },
  {
    id: 'glm-1',
    filename: 'glm-pro-subscription.json',
    provider: 'glm',
    label: 'GLM 编码订阅 (移植验证)',
    accountEmail: 'glm-subscriber@work.cn',
    tier: 'Coding Pro',
    status: 'active',
    successCount: 450,
    failCount: 0,
    healthHistory: [true, true, true, true, true, true, true, true],
    createdAt: '2026/9/10 03:00:00',
    metrics: [
      {
        key: 'glm-token',
        name: 'GLM-4 / GLM-5.3 周期额度',
        percentRemaining: 84,
        timeRemainingPercent: 62,
        windowLabel: '月限额',
        resetText: '剩余 84% · 18天后重置',
        isReliable: true,
      },
    ],
  },
]

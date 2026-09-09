/**
 * Mock data fixture based on actual manager upstream schema (/tmp/cpamc-repo SHA ed5f1c48e11b).
 * All account names and emails strictly use fictitious example.com domains to ensure
 * total safety during recording and GIF demonstration (fixing R4 privacy finding).
 */

export type ProviderType = 'kimi' | 'codex' | 'anthropic' | 'antigravity' | 'xai' | 'glm'

export interface QuotaWindowMetric {
  key: string
  name: string
  percentRemaining: number // 0 - 100
  timeRemainingPercent?: number | undefined // 0 - 100
  windowLabel: string
  resetText: string
  isReliable: boolean
  isExceeded?: boolean | undefined
}

export interface AccountPoolItem {
  id: string
  filename: string
  provider: ProviderType
  label: string
  accountEmail: string
  tier: string
  status: 'active' | 'expired' | 'warning' | 'error'
  statusMessage?: string | undefined
  successCount: number
  failCount: number
  healthHistory: boolean[]
  createdAt: string
  metrics: QuotaWindowMetric[]
}

export const MOCK_ACCOUNTS: AccountPoolItem[] = [
  {
    id: 'antigravity-1',
    filename: 'antigravity-dev-alpha@example.com.json',
    provider: 'antigravity',
    label: 'Antigravity Pro Alpha',
    accountEmail: 'dev-alpha@example.com',
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
    filename: 'antigravity-workspace-team@example.com.json',
    provider: 'antigravity',
    label: 'Antigravity Workspace',
    accountEmail: 'workspace-team@example.com',
    tier: 'Pro',
    status: 'active',
    successCount: 2270,
    failCount: 5,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true, true, false, true, true],
    createdAt: '2026/9/10 01:26:35',
    metrics: [
      {
        key: 'gemini-5h',
        name: 'Five Hour Limit Remaining',
        percentRemaining: 93,
        timeRemainingPercent: 46, // 2h 17m of 5h
        windowLabel: '5h',
        resetText: '剩余 93% · 2 小时 17 分钟 后刷新',
        isReliable: true,
      },
      {
        key: 'gemini-weekly',
        name: 'Weekly Limit Remaining',
        percentRemaining: 59,
        timeRemainingPercent: 20, // ~1d 9h of 7d
        windowLabel: '周限额',
        resetText: '剩余 59% · 1 天 9 小时 后刷新',
        isReliable: true,
      },
      {
        key: 'claude-5h',
        name: 'Claude 和 GPT 模型 5h 限额',
        percentRemaining: 100,
        timeRemainingPercent: 95,
        windowLabel: '5h',
        resetText: '额度可用 · 4 小时 47 分钟 后刷新',
        isReliable: true,
      },
      {
        key: 'claude-weekly',
        name: 'Claude 和 GPT 模型 周限额',
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
    filename: 'codex-pool-engine@example.com-pro.json',
    provider: 'codex',
    label: 'Codex 20x Dev Pool',
    accountEmail: 'pool-engine@example.com',
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
        timeRemainingPercent: 71, // 5 days remaining of 7d
        windowLabel: '周限额',
        resetText: '77% · 09/15 02:32 · 5天后',
        isReliable: true,
      },
      {
        key: 'spark-5h',
        name: 'GPT-5.3-Codex-Spark 5h',
        percentRemaining: 100,
        timeRemainingPercent: 80,
        windowLabel: '5h',
        resetText: '100% · 09/10 06:25 · 4小时后',
        isReliable: true,
      },
      {
        key: 'spark-7d',
        name: 'GPT-5.3-Codex-Spark 周限额',
        percentRemaining: 100,
        timeRemainingPercent: 85,
        windowLabel: '周限额',
        resetText: '100% · 09/17 01:25 · 6天后',
        isReliable: true,
      },
      {
        key: 'reserve-7d',
        name: 'gpt-reserve 周限额',
        percentRemaining: 100,
        timeRemainingPercent: 85,
        windowLabel: '周限额',
        resetText: '100% · 09/17 01:25 · 6天后',
        isReliable: true,
      },
    ],
  },
  {
    id: 'kimi-1',
    filename: 'kimi-research-seat@example.com.json',
    provider: 'kimi',
    label: 'Kimi Research Account',
    accountEmail: 'research-seat@example.com',
    tier: 'Standard',
    status: 'active',
    successCount: 1443,
    failCount: 11,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true],
    createdAt: '2026/9/10 02:17:00',
    metrics: [
      {
        key: '5h-window',
        name: '5h 限额 (已探测)',
        percentRemaining: 100,
        timeRemainingPercent: 40,
        windowLabel: '5h',
        resetText: '100% · 09/10 02:17',
        isReliable: true,
      },
    ],
  },
  {
    id: 'xai-1',
    filename: 'xai-grok-sub@example.com.json',
    provider: 'xai',
    label: 'xAI Grok Subscription',
    accountEmail: 'grok-sub@example.com',
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
        name: '周限额 (月度账单探测)',
        percentRemaining: 0,
        timeRemainingPercent: 9, // ~13h remaining
        windowLabel: '周限额',
        resetText: '已用 100% · 重置 09/10 15:00 · 13小时后',
        isReliable: true,
        isExceeded: true,
      },
    ],
  },
  {
    id: 'anthropic-1',
    filename: 'anthropic-workstation@example.com.json',
    provider: 'anthropic',
    label: 'Claude Team Workstation',
    accountEmail: 'workstation@example.com',
    tier: 'Team',
    status: 'active',
    successCount: 3105,
    failCount: 2,
    healthHistory: [true, true, true, true, true, true, true, true, true, true, true, true],
    createdAt: '2026/9/8 14:20:11',
    metrics: [
      {
        key: 'claude-sonnet',
        name: 'Claude 3.5 Sonnet / Opus 窗口 (被动响应头)',
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
    filename: 'glm-coding-plan@example.com.json',
    provider: 'glm',
    label: 'GLM Coding Plan (CN个人订阅)',
    accountEmail: 'coding-plan@example.com',
    tier: 'Coding Plan (CN)',
    status: 'active',
    successCount: 450,
    failCount: 0,
    healthHistory: [true, true, true, true, true, true, true, true],
    createdAt: '2026/9/10 03:00:00',
    metrics: [
      {
        key: 'glm-5h',
        name: 'GLM Coding 5h 限额 (已用 16%)',
        percentRemaining: 84, // 100 - used_percent (16%)
        timeRemainingPercent: 54, // ~2.7h remaining
        windowLabel: '5h 窗口',
        resetText: '剩余 84% (已用 16%) · 2 小时 42 分钟后重置',
        isReliable: true,
      },
      {
        key: 'glm-weekly',
        name: 'GLM Coding 周限额 (已用 35%)',
        percentRemaining: 65, // 100 - used_percent (35%)
        timeRemainingPercent: 71, // 5 days remaining
        windowLabel: '周限额',
        resetText: '剩余 65% (已用 35%) · 5 天后重置',
        isReliable: true,
      },
    ],
  },
]

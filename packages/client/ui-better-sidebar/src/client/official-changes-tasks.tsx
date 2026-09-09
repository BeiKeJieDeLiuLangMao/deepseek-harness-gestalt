/** Register Changes, transient diff, and Tasks under the official Sidebar contracts. */
import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  SidebarRightDescriptorTab,
  SidebarRightProjection,
  SidebarRightTabDefinition,
  TabId,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarContext, SidebarSessionList, SidebarSubagentAddress } from '../context-types.ts'
import { isNarrowWidth } from './breakpoints.ts'
import { ChangesTab, opCountOf, type ChangesTabPayload } from './changes/ChangesTab.tsx'
import { DiffTab } from './DiffTab.tsx'
import { t } from './locales.ts'
import { officialFileAddress } from './official-files/address.ts'
import { detectNewDirectSubagent } from './subagent-detect.ts'
import { detectNewJob } from './subagent-jobs.ts'
import { SubagentView } from './SubagentView.tsx'
import type { SidebarDiffRef, SidebarTab } from './state.ts'

/** Official page kinds retained from the Better Sidebar tab discriminants. */
export const OFFICIAL_CHANGES_KIND = 'git'
export const OFFICIAL_TASKS_KIND = 'subagent'
export const OFFICIAL_DIFF_KIND = 'diff'

/** Stable official definition ids used by keyed bodies and preference maps. */
export const OFFICIAL_CHANGES_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/git'
export const OFFICIAL_TASKS_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/subagent'
export const OFFICIAL_DIFF_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/diff'

/** Exact Cordis services required before the three official types register. */
export const OFFICIAL_CHANGES_TASKS_INJECT = [
  'slots',
  'sidebarRight',
  'sidebarRightTabs',
  'sidebarRightPreferences',
  'sessions',
] as const

/** Client context required by the official Changes and Tasks adapter. */
export type OfficialChangesTasksContext = SidebarContext & Pick<
  ClientContext,
  'sidebarRight' | 'sidebarRightTabs' | 'sidebarRightPreferences'
>

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabPayloadMap {
    git: ChangesTabPayload
    diff: SidebarDiffRef
  }
}

/** Side Chat origin/title frames settle separately; wait before classifying a new child. */
const AUTO_OPEN_DEBOUNCE_MS = 500

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Decode the durable lens and inline-preview geometry owned by one Changes occurrence. */
export function officialChangesPayloadOf(value: unknown): ChangesTabPayload {
  const record = recordOf(value)
  if (record === undefined) return {}
  const lens = record.lens === 'git' || record.lens === 'session' ? record.lens : undefined
  const previewH = typeof record.previewH === 'number' && Number.isFinite(record.previewH)
    ? record.previewH
    : undefined
  return {
    ...(lens === undefined ? {} : { lens }),
    ...(previewH === undefined ? {} : { previewH }),
  }
}

/** Decode one persisted expanded-diff reference before it reaches Git RPCs. */
export function officialDiffPayloadOf(value: unknown): SidebarDiffRef | undefined {
  const record = recordOf(value)
  if (record?.kind === 'worktree') {
    if (typeof record.path !== 'string' || typeof record.staged !== 'boolean') return undefined
    if (record.untracked !== undefined && typeof record.untracked !== 'boolean') return undefined
    if (record.worktree !== undefined && typeof record.worktree !== 'string') return undefined
    if (record.repoRoot !== undefined && typeof record.repoRoot !== 'string') return undefined
    return {
      kind: 'worktree',
      path: record.path,
      staged: record.staged,
      ...(typeof record.untracked === 'boolean' ? { untracked: record.untracked } : {}),
      ...(typeof record.worktree === 'string' ? { worktree: record.worktree } : {}),
      ...(typeof record.repoRoot === 'string' ? { repoRoot: record.repoRoot } : {}),
    }
  }
  if (record?.kind !== 'commit') return undefined
  if (
    typeof record.hash !== 'string'
    || typeof record.hashFull !== 'string'
    || typeof record.subject !== 'string'
    || (record.worktree !== undefined && typeof record.worktree !== 'string')
    || (record.repoRoot !== undefined && typeof record.repoRoot !== 'string')
  ) return undefined
  return {
    kind: 'commit',
    hash: record.hash,
    hashFull: record.hashFull,
    subject: record.subject,
    ...(typeof record.worktree === 'string' ? { worktree: record.worktree } : {}),
    ...(typeof record.repoRoot === 'string' ? { repoRoot: record.repoRoot } : {}),
  }
}

function changesDefinition(): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_CHANGES_DEFINITION_ID,
    kind: OFFICIAL_CHANGES_KIND,
    priority: 'builtin',
    order: 20,
    icon: 'diff',
    title: () => t('changes'),
    single: true,
    create: request => ({ payload: officialChangesPayloadOf(request.payload) }),
    badge: (_tab, context) => {
      const count = opCountOf(context.sessionId)
      return count === undefined || count === 0 ? null : count
    },
    settings: {
      settingsId: OFFICIAL_CHANGES_KIND,
      fields: [{
        key: 'changesDiffFloat',
        source: 'preference',
        control: 'select',
        title: () => t('changesDiffOpenTitle'),
        description: () => t('changesDiffOpenDesc'),
        options: [{
          value: true,
          title: () => t('changesDiffOpenFloat'),
          description: () => t('changesDiffOpenFloatDesc'),
        }, {
          value: false,
          title: () => t('changesDiffOpenPane'),
          description: () => t('changesDiffOpenPaneDesc'),
        }],
      }],
    },
  }
}

function tasksDefinition(): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_TASKS_DEFINITION_ID,
    kind: OFFICIAL_TASKS_KIND,
    priority: 'builtin',
    order: 30,
    icon: 'tasks',
    title: () => t('subagent'),
    single: true,
    settings: {
      settingsId: OFFICIAL_TASKS_KIND,
      fields: [{
        key: 'autoOpenSubagent',
        source: 'preference',
        control: 'switch',
        title: () => t('settingsSubagentTitle'),
        description: () => t('settingsSubagentDesc'),
      }, {
        key: 'autoOpenJobs',
        source: 'preference',
        control: 'switch',
        title: () => t('settingsJobsTitle'),
        description: () => t('settingsJobsDesc'),
      }],
    },
  }
}

function diffDefinition(live: Set<string>): SidebarRightTabDefinition {
  return {
    id: OFFICIAL_DIFF_DEFINITION_ID,
    kind: OFFICIAL_DIFF_KIND,
    priority: 'builtin',
    order: -1,
    hidden: true,
    icon: 'diff',
    title: () => t('changes'),
    create: request => {
      const payload = officialDiffPayloadOf(request.payload)
      return payload === undefined ? false : { title: request.title, payload }
    },
    dedupeKey: (tab: SidebarRightDescriptorTab) => tab.contentId,
    onOpen: tab => { live.add(tab.id) },
    close: context => { live.delete(context.tab.id) },
  }
}

type OfficialBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & { ctx: OfficialChangesTasksContext }

function useOfficialPreferences(ctx: OfficialChangesTasksContext) {
  const subscribe = useCallback(
    (listener: () => void) => ctx.sidebarRightPreferences.subscribe(listener),
    [ctx],
  )
  const getSnapshot = useCallback(() => ctx.sidebarRightPreferences.getSnapshot(), [ctx])
  return useSyncExternalStore(subscribe, getSnapshot).preferences
}

/** Open one expanded Git diff through the official occurrence and placement owner. */
export function openOfficialDiff(
  ctx: OfficialChangesTasksContext,
  sessionId: SessionId,
  legacy: SidebarTab,
  shouldFloat: boolean,
): void {
  const diff = legacy.diff
  if (diff === undefined) return
  void ctx.sidebarRight.forSession(sessionId).openTab(OFFICIAL_DIFF_KIND, {
    instanceId: legacy.id,
    title: legacy.title,
    payload: diff,
    surface: 'right',
  }).then((id) => {
    if (shouldFloat && ctx.sidebarRight.getSnapshot().mountedSessionId === sessionId) {
      ctx.sidebarRight.float(id)
    }
  }).catch((error: unknown) => {
    console.error('[dsh-better-sidebar] open official diff failed:', error)
  })
}

/** Official Changes body over the existing dual-lens component. */
export function OfficialChangesBody({ ctx, useSessions, useTabInfo }: OfficialBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const cwd = useSessions(sessions => sessions.byId[tab.sessionId]?.cwd)
  const preferences = useOfficialPreferences(ctx)
  const payload = officialChangesPayloadOf(tab.payload)
  return (
    <ChangesTab
      scope={{ sessionId: tab.sessionId, cwd }}
      payload={payload}
      visible={tab.visible}
      workspaceFence={preferences.workspaceFence}
      onPayloadChange={(next) => { tab.actions.update({ payload: next }) }}
      onOpenFile={(path) => { tab.actions.openResource(officialFileAddress(tab.sessionId, cwd, path)) }}
      onOpenDiff={(diff) => { openOfficialDiff(ctx, tab.sessionId, diff, preferences.changesDiffFloat) }}
    />
  )
}

/** Official expanded-diff body; malformed restored payloads render no RPC surface. */
export function OfficialDiffBody({ useSessions, useTabInfo }: OfficialBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const cwd = useSessions(sessions => sessions.byId[tab.sessionId]?.cwd)
  const diff = officialDiffPayloadOf(tab.payload)
  return diff === undefined ? null : <DiffTab sessionId={tab.sessionId} cwd={cwd} diff={diff} />
}

/** Official Tasks body over the existing topology, activity, jobs, and kill UI. */
export function OfficialTasksBody({ ctx, useTabInfo }: OfficialBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const openChild = (address: SidebarSubagentAddress): void => {
    void ctx.sidebarRight.forSession(SessionId(address.childSessionId)).openTab(OFFICIAL_TASKS_KIND).catch((error: unknown) => {
      console.error('[dsh-better-sidebar] prepare child Tasks page failed:', error)
    })
  }
  return (
    <SubagentView
      sessionId={tab.sessionId}
      active={tab.visible}
      sessions={ctx.sessions}
      onOpenChild={openChild}
    />
  )
}

function activateTasks(ctx: OfficialChangesTasksContext, sessionId: string): void {
  if (!ctx.sidebarRightTabs.isTabEnabled(OFFICIAL_TASKS_DEFINITION_ID)) return
  const activate = typeof window === 'undefined' || !isNarrowWidth(window.innerWidth)
  void ctx.sidebarRight.forSession(SessionId(sessionId)).openTab(OFFICIAL_TASKS_KIND, { activate }).catch((error: unknown) => {
    console.error('[dsh-better-sidebar] auto-open official Tasks page failed:', error)
  })
}

/** Subscribe to current-Session subagent and job arrivals for official Tasks auto-open. */
export function subscribeOfficialTasksAutoOpen(ctx: OfficialChangesTasksContext): () => void {
  let previous = ctx.sessions.list.getSnapshot()
  let pending: { baseline: SidebarSessionList; timer: number } | undefined
  let disposed = false
  const cancelPending = (): void => {
    if (pending !== undefined) window.clearTimeout(pending.timer)
    pending = undefined
  }
  const unsubscribe = ctx.sessions.list.subscribe(() => {
    const next = ctx.sessions.list.getSnapshot()
    const sessionId = next.current
    if (sessionId === undefined || previous.current !== sessionId) {
      cancelPending()
      previous = next
      return
    }
    if (pending === undefined && detectNewDirectSubagent(previous, next, sessionId)) {
      const baseline = previous
      const timer = window.setTimeout(() => {
        pending = undefined
        if (disposed) return
        const settled = ctx.sessions.list.getSnapshot()
        if (settled.current !== sessionId || !detectNewDirectSubagent(baseline, settled, sessionId)) return
        if (!ctx.sidebarRightPreferences.getSnapshot().preferences.autoOpenSubagent) return
        activateTasks(ctx, sessionId)
      }, AUTO_OPEN_DEBOUNCE_MS)
      pending = { baseline, timer }
    }
    if (
      detectNewJob(previous, next, sessionId)
      && ctx.sidebarRightPreferences.getSnapshot().preferences.autoOpenJobs
    ) activateTasks(ctx, sessionId)
    previous = next
  })
  return () => {
    disposed = true
    cancelPending()
    unsubscribe()
  }
}

function restoredDiffTabs(projection: SidebarRightProjection, live: ReadonlySet<string>) {
  return projection.sessions.flatMap(session => session.tabs
    .filter(tab => tab.record.kind === OFFICIAL_DIFF_KIND && !live.has(tab.record.id))
    .map(tab => ({ sessionId: session.sessionId, tabId: tab.record.id })))
}

/** Close diff occurrences restored from durable layout while retaining diffs opened in this runtime. */
export function subscribeTransientOfficialDiffs(
  ctx: OfficialChangesTasksContext,
  live: ReadonlySet<string>,
): () => void {
  const pending = new Set<string>()
  let scheduled = false
  let disposed = false
  const inspect = (): void => {
    scheduled = false
    if (disposed) return
    for (const tab of restoredDiffTabs(ctx.sidebarRight.getSnapshot(), live)) {
      if (pending.has(tab.tabId)) continue
      pending.add(tab.tabId)
      void ctx.sidebarRight.forSession(tab.sessionId).close(tab.tabId as TabId)
        .catch((error: unknown) => {
          console.error('[dsh-better-sidebar] close restored official diff failed:', error)
        })
        .finally(() => { pending.delete(tab.tabId) })
    }
  }
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(inspect)
  }
  const unsubscribe = ctx.sidebarRight.subscribe(schedule)
  schedule()
  return () => {
    disposed = true
    unsubscribe()
  }
}

/** Register official Changes, transient diff, Tasks, bodies, and feed subscriptions. */
export function registerOfficialChangesTasks(ctx: OfficialChangesTasksContext): () => void {
  const liveDiffs = new Set<string>()
  const body = (component: typeof OfficialChangesBody, key: string) => ctx.slots.inject(
    'sidebar.right.pane.tab',
    () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key,
      inject: () => ({ ctx }),
    }, component),
  )
  const disposers = [
    ctx.sidebarRightTabs.register(changesDefinition()),
    ctx.sidebarRightTabs.register(tasksDefinition()),
    ctx.sidebarRightTabs.register(diffDefinition(liveDiffs)),
    body(OfficialChangesBody, OFFICIAL_CHANGES_DEFINITION_ID),
    body(OfficialTasksBody, OFFICIAL_TASKS_DEFINITION_ID),
    body(OfficialDiffBody, OFFICIAL_DIFF_DEFINITION_ID),
    subscribeOfficialTasksAutoOpen(ctx),
    subscribeTransientOfficialDiffs(ctx, liveDiffs),
  ]
  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]?.()
  }
}

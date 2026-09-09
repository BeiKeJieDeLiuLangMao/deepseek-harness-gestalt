// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SidebarRightProjection,
  SidebarRightTabDefinition,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarSessionList } from '../src/context-types.ts'
import {
  OFFICIAL_CHANGES_DEFINITION_ID,
  OFFICIAL_CHANGES_TASKS_INJECT,
  OFFICIAL_DIFF_DEFINITION_ID,
  OFFICIAL_TASKS_DEFINITION_ID,
  officialChangesPayloadOf,
  officialDiffPayloadOf,
  openOfficialDiff,
  registerOfficialChangesTasks,
  subscribeOfficialTasksAutoOpen,
  subscribeTransientOfficialDiffs,
  type OfficialChangesTasksContext,
} from '../src/client/official-changes-tasks.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function emptyProjection(sessionId = 'session-a'): SidebarRightProjection {
  return {
    mountedSessionId: SessionId(sessionId),
    sessions: [],
    pinned: [],
  }
}

describe('official Changes and Tasks payloads', () => {
  it('keeps valid occurrence state and rejects malformed expanded diff fields', () => {
    expect(officialChangesPayloadOf({ lens: 'session', previewH: 312, ignored: true })).toEqual({
      lens: 'session', previewH: 312,
    })
    expect(officialChangesPayloadOf({ lens: 'other', previewH: Number.NaN })).toEqual({})

    expect(officialDiffPayloadOf({
      kind: 'worktree', path: 'src/a.ts', staged: false, untracked: true, repoRoot: '/repo',
    })).toEqual({ kind: 'worktree', path: 'src/a.ts', staged: false, untracked: true, repoRoot: '/repo' })
    expect(officialDiffPayloadOf({
      kind: 'commit', hash: 'abc', hashFull: 'abcdef', subject: 'change', worktree: '/tree',
    })).toEqual({ kind: 'commit', hash: 'abc', hashFull: 'abcdef', subject: 'change', worktree: '/tree' })
    expect(officialDiffPayloadOf({ kind: 'worktree', path: 'src/a.ts', staged: 'no' })).toBeUndefined()
    expect(officialDiffPayloadOf({ kind: 'commit', hash: 'abc', subject: 'missing full hash' })).toBeUndefined()
  })
})

describe('official Changes and Tasks registration', () => {
  it('publishes the three definitions and keyed bodies through one disposable adapter', async () => {
    const definitions: SidebarRightTabDefinition[] = []
    const entries: Array<{ name: string; key?: string; component: unknown }> = []
    const sidebarListeners = new Set<() => void>()
    const sessionListeners = new Set<() => void>()
    const ctx = {
      sidebarRightTabs: {
        register: vi.fn((definition: SidebarRightTabDefinition) => {
          definitions.push(definition)
          return () => { definitions.splice(definitions.indexOf(definition), 1) }
        }),
        isTabEnabled: () => true,
      },
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { autoOpenSubagent: true, autoOpenJobs: true } }),
        subscribe: () => () => {},
      },
      sidebarRight: {
        getSnapshot: () => emptyProjection(),
        subscribe: (listener: () => void) => {
          sidebarListeners.add(listener)
          return () => { sidebarListeners.delete(listener) }
        },
        forSession: () => ({ close: vi.fn(() => Promise.resolve()) }),
      },
      sessions: {
        list: {
          getSnapshot: () => ({ current: SessionId('session-a'), byId: {} }),
          subscribe: (listener: () => void) => {
            sessionListeners.add(listener)
            return () => { sessionListeners.delete(listener) }
          },
        },
      },
      slots: {
        inject: (_name: string, register: () => () => void) => register(),
        register: (entry: { name: string; key?: string }, component: unknown) => {
          const recorded = { ...entry, component }
          entries.push(recorded)
          return () => { entries.splice(entries.indexOf(recorded), 1) }
        },
      },
    } as unknown as OfficialChangesTasksContext

    expect(OFFICIAL_CHANGES_TASKS_INJECT).toEqual([
      'slots', 'sidebarRight', 'sidebarRightTabs', 'sidebarRightPreferences', 'sessions',
    ])
    const dispose = registerOfficialChangesTasks(ctx)
    await Promise.resolve()
    expect(definitions.map(definition => definition.id)).toEqual([
      OFFICIAL_CHANGES_DEFINITION_ID,
      OFFICIAL_TASKS_DEFINITION_ID,
      OFFICIAL_DIFF_DEFINITION_ID,
    ])
    expect(entries.map(entry => [entry.name, entry.key])).toEqual([
      ['sidebar.right.pane.tab', OFFICIAL_CHANGES_DEFINITION_ID],
      ['sidebar.right.pane.tab', OFFICIAL_TASKS_DEFINITION_ID],
      ['sidebar.right.pane.tab', OFFICIAL_DIFF_DEFINITION_ID],
    ])
    expect(definitions[0]?.single).toBe(true)
    expect(definitions[1]?.single).toBe(true)
    expect(definitions[2]).toMatchObject({ hidden: true, kind: 'diff' })

    dispose()
    expect(definitions).toEqual([])
    expect(entries).toEqual([])
    expect(sidebarListeners.size).toBe(0)
    expect(sessionListeners.size).toBe(0)
  })
})

describe('official expanded diff placement', () => {
  it('dedupes by the legacy diff identity, floats on request, and leaves docked placement intact', async () => {
    const openTab = vi.fn(() => Promise.resolve('tab-7'))
    const float = vi.fn()
    const ctx = {
      sidebarRight: {
        forSession: vi.fn(() => ({ openTab })),
        getSnapshot: () => emptyProjection(),
        float,
      },
    } as unknown as OfficialChangesTasksContext
    const diff = {
      id: 'diff:w::u:src/a.ts',
      type: 'diff',
      title: 'a.ts',
      diff: { kind: 'worktree' as const, path: 'src/a.ts', staged: false },
    }

    openOfficialDiff(ctx, SessionId('session-a'), diff, true)
    await Promise.resolve()
    expect(openTab).toHaveBeenLastCalledWith('diff', {
      instanceId: diff.id,
      title: 'a.ts',
      payload: diff.diff,
      surface: 'right',
    })
    expect(float).toHaveBeenCalledWith('tab-7')

    openOfficialDiff(ctx, SessionId('session-a'), diff, false)
    await Promise.resolve()
    expect(openTab).toHaveBeenCalledTimes(2)
    expect(float).toHaveBeenCalledTimes(1)
  })

  it('closes restored diff occurrences but preserves ids opened by the current runtime', async () => {
    const close = vi.fn(() => Promise.resolve({ admitted: true, closed: [], failed: [] }))
    const listeners = new Set<() => void>()
    const projection = {
      mountedSessionId: SessionId('session-a'),
      sessions: [{
        sessionId: SessionId('session-a'),
        rightExpanded: true,
        bottomExpanded: false,
        bottomHeight: 220,
        data: {},
        tabs: [
          { record: { id: 'restored', kind: 'diff' } },
          { record: { id: 'live', kind: 'diff' } },
        ],
      }],
      pinned: [],
    } as unknown as SidebarRightProjection
    const ctx = {
      sidebarRight: {
        getSnapshot: () => projection,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        forSession: vi.fn(() => ({ close })),
      },
    } as unknown as OfficialChangesTasksContext

    const dispose = subscribeTransientOfficialDiffs(ctx, new Set(['live']))
    await Promise.resolve()
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith('restored')
    dispose()
    expect(listeners.size).toBe(0)
  })
})

function job(id: string) {
  return { id, kind: 'bash', label: id, status: 'running' as const, startedAt: 1 }
}

function list(jobs: string[] = [], children: string[] = []): SidebarSessionList {
  return {
    current: SessionId('session-a'),
    byId: {
      'session-a': { id: SessionId('session-a'), displayTitle: 'Main' },
      ...Object.fromEntries(children.map(id => [id, {
        id: SessionId(id), displayTitle: id, origin: 'subagent' as const, parentId: SessionId('session-a'),
      }])),
    },
    jobsBySession: { 'session-a': jobs.map(job) },
  }
}

describe('official Tasks auto-open', () => {
  it('activates for every new job on wide screens and prepares without focus on narrow screens', async () => {
    let snapshot = list()
    let enabled = true
    const listeners = new Set<() => void>()
    const openTab = vi.fn(() => Promise.resolve('tasks-tab'))
    const ctx = {
      sessions: { list: {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      } },
      sidebarRightTabs: { isTabEnabled: () => enabled },
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { autoOpenSubagent: true, autoOpenJobs: true } }),
      },
      sidebarRight: { forSession: vi.fn(() => ({ openTab })) },
    } as unknown as OfficialChangesTasksContext
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const dispose = subscribeOfficialTasksAutoOpen(ctx)

    snapshot = list(['job-1'])
    for (const listener of listeners) listener()
    await Promise.resolve()
    snapshot = list(['job-1', 'job-2'])
    for (const listener of listeners) listener()
    await Promise.resolve()
    expect(openTab).toHaveBeenNthCalledWith(1, 'subagent', { activate: true })
    expect(openTab).toHaveBeenNthCalledWith(2, 'subagent', { activate: true })

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
    snapshot = list(['job-1', 'job-2', 'job-3'])
    for (const listener of listeners) listener()
    await Promise.resolve()
    expect(openTab).toHaveBeenNthCalledWith(3, 'subagent', { activate: false })

    enabled = false
    snapshot = list(['job-1', 'job-2', 'job-3', 'job-4'])
    for (const listener of listeners) listener()
    await Promise.resolve()
    expect(openTab).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('debounces a new direct subagent and releases its timer and feed subscription', async () => {
    vi.useFakeTimers()
    let snapshot = list()
    const listeners = new Set<() => void>()
    const openTab = vi.fn(() => Promise.resolve('tasks-tab'))
    const ctx = {
      sessions: { list: {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      } },
      sidebarRightTabs: { isTabEnabled: () => true },
      sidebarRightPreferences: {
        getSnapshot: () => ({ preferences: { autoOpenSubagent: true, autoOpenJobs: true } }),
      },
      sidebarRight: { forSession: vi.fn(() => ({ openTab })) },
    } as unknown as OfficialChangesTasksContext
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const dispose = subscribeOfficialTasksAutoOpen(ctx)

    snapshot = list([], ['child-a'])
    for (const listener of listeners) listener()
    expect(openTab).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(openTab).toHaveBeenCalledWith('subagent', { activate: true })

    snapshot = list([], ['child-a', 'child-b'])
    for (const listener of listeners) listener()
    dispose()
    await vi.advanceTimersByTimeAsync(500)
    expect(openTab).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})

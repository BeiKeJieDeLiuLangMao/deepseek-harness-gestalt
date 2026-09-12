// @vitest-environment jsdom
// The browser half on a real SlotRegistry: the plugin declares its services,
// registers the `member-question` dictionaries, and contributes its additive
// input-dock entry above the shared product composer; teardown empties
// the contribution (HMR safety).
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { MemberQuestionDock } from '../src/client/MemberQuestionCard.tsx'
import { apply, inject } from '../src/client/index.ts'
import type { MemberQuestionReferenceView } from '../src/client/contract/slots.ts'
import { apply as nodeApply } from '../src/index.ts'
import { en as questionEn, zh as questionZh } from '@deepseek-ai/dsh-client-ui-user-questions/src/client/locales.ts'

async function bench(sessions?: {
  list: { getSnapshot: () => { byId: Record<string, { cwd?: string } | undefined> }; subscribe: (listener: () => void) => () => void }
}) {
  const ctx = new Context()
  const openWorkspacePath = vi.fn(async () => ({
    ok: true as const,
    value: { opened: true },
  }))
  new TestRemote(ctx, { session: { openWorkspacePath } })
  ctx.provide('sessions', sessions ?? {
    list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} },
  })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.input.dock': { kind: 'list', scope: 'session' } },
  } as never, (() => null) as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  locale.register('question', { zh: questionZh, en: questionEn })
  ctx.provide('locale', locale)
  ctx.slots.installLocale(locale)
  const receivingQuestions = {
    pending: () => undefined,
    records: () => [],
    settle: vi.fn(async () => {}),
    decline: vi.fn(async () => {}),
    getSnapshot: () => ({ byId: {} }),
    subscribe: () => () => {},
  }
  ctx.provide('receivingQuestions', receivingQuestions)
  ctx.receivingQuestions = receivingQuestions as never
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, openWorkspacePath, locale, receivingQuestions }
}

describe('ui-member-questions browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'receivingQuestions', 'remote', 'remote.session'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the additive input-dock entry and unregisters on teardown', async () => {
    const { ctx, fiber, locale, receivingQuestions } = await bench()
    try {
      const entries = ctx.slots.entries('conversation.input.dock')
      expect(entries).toHaveLength(1)
      const entry = entries[0]!
      expect(entry.component).toBe(MemberQuestionDock)
      expect(entry.options.order).toBe(-20)

      const memberT = locale.bind('member-question')
      expect(memberT('tag.remote')).toBe('远端')
      expect(memberT('collapsed.mark')).toBe('已收起')

      expect(entry.children).toEqual({
        'question.presentation': { kind: 'single', scope: 'session' },
      })
      const injected = (entry.inject as unknown as () => {
        settle: (sessionId: SessionId, answers: { id: string; selected: string[] }[]) => Promise<void>
        decline: (sessionId: SessionId) => Promise<void>
      })()
      expect(typeof injected.settle).toBe('function')
      expect(typeof injected.decline).toBe('function')
      await injected.settle('receiving-session' as SessionId, [{ id: 'channel', selected: ['Canary'] }])
      expect(receivingQuestions.settle).toHaveBeenCalledWith(
        'receiving-session',
        [{ id: 'channel', selected: ['Canary'] }],
      )
      await injected.decline('receiving-session' as SessionId)
      expect(receivingQuestions.decline).toHaveBeenCalledWith('receiving-session')
    } finally {
      await fiber.dispose()
    }
    expect(ctx.slots.entries('conversation.input.dock')).toHaveLength(0)
  })

  it('opens a receiver-scoped resource through late official viewers and falls back after disposal', async () => {
    const byId: Record<string, { cwd?: string } | undefined> = {}
    const { ctx, fiber, openWorkspacePath } = await bench({
      list: { getSnapshot: () => ({ byId }), subscribe: () => () => {} },
    })
    const entry = ctx.slots.entries('conversation.input.dock')[0]!
    const injected = (entry.inject as unknown as () => {
      openReference: (sessionId: SessionId, path: string, title?: string) => Promise<void>
    })()
    const sessionId = 'receiving-session' as SessionId
    const openResource = vi.fn(async () => 'resource-tab')
    const update = vi.fn()
    const forSession = vi.fn(() => ({ openResource, update }))
    const candidates = vi.fn(() => [{ kind: 'text' }])
    const disposeRegistry = ctx.reflect.provide('sidebarRightTabs', { candidates })
    const disposeSidebar = ctx.reflect.provide('sidebarRight', { forSession })
    try {
      byId[sessionId] = { cwd: '/bound-workspace' }
      await injected.openReference(sessionId, '.dsh/member-questions/question-1/brief #1.html', 'brief.html')
      expect(forSession).toHaveBeenCalledWith(sessionId)
      expect(openResource).toHaveBeenCalledWith(
        'dsh-resource://file/session/receiving-session/.dsh/member-questions/question-1/brief%20%231.html',
      )
      expect(update).toHaveBeenCalledWith('resource-tab', { title: 'brief.html' })
      expect(openWorkspacePath).not.toHaveBeenCalled()

      const unscopedId = 'receiving-session-unscoped' as SessionId
      byId[unscopedId] = {}
      await injected.openReference(unscopedId, '.dsh/member-questions/question-1/brief.html')
      expect(forSession).toHaveBeenLastCalledWith(unscopedId)
      expect(openResource).toHaveBeenLastCalledWith(
        'dsh-resource://file/session/receiving-session-unscoped/.dsh/member-questions/question-1/brief.html',
      )
      expect(update).toHaveBeenCalledTimes(1)

      candidates.mockReturnValue([])
      await injected.openReference(sessionId, '.dsh/member-questions/question-1/brief.html')
      expect(openWorkspacePath).toHaveBeenLastCalledWith({
        path: '/bound-workspace/.dsh/member-questions/question-1/brief.html',
      })
      await disposeSidebar()
      await injected.openReference(sessionId, '.dsh/member-questions/question-1/brief.html')
      expect(openWorkspacePath).toHaveBeenCalledTimes(2)
      expect(openResource).toHaveBeenCalledTimes(2)
    } finally {
      await disposeSidebar()
      await disposeRegistry()
      await fiber.dispose()
    }
  })

  it('propagates navigation failures without opening the same material outside the workbench', async () => {
    const { ctx, fiber, openWorkspacePath } = await bench()
    const entry = ctx.slots.entries('conversation.input.dock')[0]!
    const injected = (entry.inject as unknown as () => {
      openReference: (sessionId: SessionId, path: string, title?: string) => Promise<void>
    })()
    const failure = new Error('Reference navigation failed')
    const openResource = vi.fn(() => Promise.reject(failure))
    const forSession = vi.fn(() => ({ openResource, update: vi.fn() }))
    const disposeRegistry = ctx.reflect.provide('sidebarRightTabs', { candidates: () => [{ kind: 'text' }] })
    const disposeSidebar = ctx.reflect.provide('sidebarRight', { forSession })
    try {
      await expect(injected.openReference('receiver' as SessionId, 'cached.md')).rejects.toBe(failure)
      forSession.mockImplementation(() => { throw failure })
      await expect(injected.openReference('receiver' as SessionId, 'cached.md')).rejects.toBe(failure)
      expect(openWorkspacePath).not.toHaveBeenCalled()
    } finally {
      await disposeSidebar()
      await disposeRegistry()
      await fiber.dispose()
    }
  })

  it('tracks visible file occurrences only in the mounted Session and releases every source', async () => {
    const sessionListeners = new Set<() => void>()
    const stateListeners = new Set<() => void>()
    const registryListeners = new Set<() => void>()
    const subscribe = (listeners: Set<() => void>) => (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
    let cwd = '/workspace'
    const { ctx, fiber } = await bench({
      list: {
        getSnapshot: () => ({ byId: { 'receiving-session': { cwd } } }),
        subscribe: subscribe(sessionListeners),
      },
    })
    const entry = ctx.slots.entries('conversation.input.dock')[0]!
    const injected = (entry.inject as unknown as () => {
      hooks: { referenceView: { getSnapshot: () => MemberQuestionReferenceView; subscribe: (listener: () => void) => () => void } }
    })()
    const source = injected.hooks.referenceView
    const listener = vi.fn()
    const release = source.subscribe(listener)
    expect(source.getSnapshot()).toEqual({ paths: [] })
    const sessionId = 'receiving-session'
    let entries = [{ kind: 'text' }]
    let viewers = [{ id: 'markdown' }]
    const tab = (contentId: string, visible = true) => ({
      record: { kind: 'text', contentId }, visible, active: false,
    })
    const tabs = [
      tab('dsh-resource://file/session/receiving-session/brief.md'),
      tab('dsh-resource://file/absolute/workspace/floating.html'),
      tab('dsh-resource://file/session/receiving-session/inactive.md', false),
      tab('dsh-resource://file/session/other-session/brief.md'),
      tab('sidebar://guide'),
    ]
    let snapshot = {
      mountedSessionId: sessionId as string | undefined,
      sessions: [
        { sessionId, tabs },
        { sessionId: 'cold-session', tabs: [tab('dsh-resource://file/absolute/workspace/cold.md')] },
      ],
    }
    let disposeRegistry = ctx.reflect.provide('sidebarRightTabs', {
      entries: () => entries,
      viewers: () => viewers,
      get: (kind: string) => entries.find(entry => entry.kind === kind),
      matchViewer: () => viewers[0],
      subscribe: subscribe(registryListeners),
    })
    let disposeSidebar = ctx.reflect.provide('sidebarRight', {
      getSnapshot: () => snapshot,
      subscribe: subscribe(stateListeners),
    })
    try {
      expect(source.getSnapshot()).toEqual({ sessionId, paths: ['/workspace/brief.md', '/workspace/floating.html'] })
      expect(source.getSnapshot()).toBe(source.getSnapshot())
      const beforeState = listener.mock.calls.length
      for (const notify of stateListeners) notify()
      expect(listener).toHaveBeenCalledTimes(beforeState + 1)

      entries = []
      for (const notify of registryListeners) notify()
      expect(source.getSnapshot()).toEqual({ sessionId, paths: [] })
      entries = [{ kind: 'text' }]
      for (const notify of registryListeners) notify()
      expect(source.getSnapshot().paths).toHaveLength(2)

      viewers = []
      for (const notify of registryListeners) notify()
      expect(source.getSnapshot()).toEqual({ sessionId, paths: [] })
      viewers = [{ id: 'markdown' }]
      for (const notify of registryListeners) notify()
      expect(source.getSnapshot().paths).toHaveLength(2)

      cwd = '/moved-workspace'
      for (const notify of sessionListeners) notify()
      expect(source.getSnapshot().paths).toEqual(['/moved-workspace/brief.md', '/workspace/floating.html'])
      snapshot = { ...snapshot, mountedSessionId: undefined }
      expect(source.getSnapshot()).toEqual({ paths: [] })
      snapshot = {
        ...snapshot, mountedSessionId: sessionId,
        sessions: [{ sessionId, tabs: tabs.map(entry => ({ ...entry, visible: false })) }],
      }
      expect(source.getSnapshot()).toEqual({ sessionId, paths: [] })
      await disposeSidebar()
      await disposeRegistry()
      expect(stateListeners.size).toBe(0)
      expect(registryListeners.size).toBe(0)
      expect(source.getSnapshot()).toEqual({ paths: [] })
      disposeRegistry = ctx.reflect.provide('sidebarRightTabs', {
        entries: () => entries,
        viewers: () => viewers,
        get: (kind: string) => entries.find(entry => entry.kind === kind),
        matchViewer: () => viewers[0],
        subscribe: subscribe(registryListeners),
      })
      snapshot = { ...snapshot, sessions: [{ sessionId, tabs }] }
      disposeSidebar = ctx.reflect.provide('sidebarRight', {
        getSnapshot: () => snapshot,
        subscribe: subscribe(stateListeners),
      })
      expect(source.getSnapshot().paths).toHaveLength(2)
      expect(stateListeners.size).toBe(1)
      expect(registryListeners.size).toBe(1)
      expect(sessionListeners.size).toBe(1)
      release()
      expect(stateListeners.size).toBe(0)
      expect(registryListeners.size).toBe(0)
      expect(sessionListeners.size).toBe(0)
      const releasedCalls = listener.mock.calls.length
      for (const notify of [...stateListeners, ...registryListeners, ...sessionListeners]) notify()
      expect(listener).toHaveBeenCalledTimes(releasedCalls)
    } finally {
      release()
      await disposeSidebar()
      await disposeRegistry()
      await fiber.dispose()
    }
  })
})

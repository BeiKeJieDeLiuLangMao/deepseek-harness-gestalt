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
  list: { getSnapshot: () => { byId: Record<string, { cwd?: string } | undefined> } }
}) {
  const ctx = new Context()
  const openWorkspacePath = vi.fn(async () => ({
    ok: true as const,
    value: { opened: true },
  }))
  new TestRemote(ctx, { session: { openWorkspacePath } })
  ctx.provide('sessions', sessions ?? {
    list: { getSnapshot: () => ({ byId: {} }) },
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

  it('uses a late Files viewer per gesture and falls back after provider disposal', async () => {
    const byId: Record<string, { cwd?: string } | undefined> = {}
    const { ctx, fiber, openWorkspacePath } = await bench({
      list: { getSnapshot: () => ({ byId }) },
    })
    const entry = ctx.slots.entries('conversation.input.dock')[0]!
    const injected = (entry.inject as unknown as () => {
      openReference: (sessionId: SessionId, path: string, title?: string) => void
    })()
    const sessionId = 'receiving-session' as SessionId
    const openFile = vi.fn()
    try {
      byId[sessionId] = { cwd: '/bound-workspace' }
      const disposeSidebar = ctx.reflect.provide('betterSidebar', {
        openFile, getTab: () => ({ id: 'editor' }),
      })
      injected.openReference(sessionId, '.dsh/member-questions/question-1/brief.html', 'brief.html')
      expect(openFile).toHaveBeenCalledWith(
        { sessionId, cwd: '/bound-workspace' },
        '/bound-workspace/.dsh/member-questions/question-1/brief.html',
        'brief.html',
      )
      expect(openWorkspacePath).not.toHaveBeenCalled()

      await disposeSidebar()
      injected.openReference(sessionId, '.dsh/member-questions/question-1/brief.html', 'brief.html')
      expect(openWorkspacePath).toHaveBeenCalledWith({
        path: '/bound-workspace/.dsh/member-questions/question-1/brief.html',
      })
      expect(openFile).toHaveBeenCalledTimes(1)

      const unscopedId = 'receiving-session-unscoped' as SessionId
      byId[unscopedId] = {}
      const disposeSidebarWithoutCwd = ctx.reflect.provide('betterSidebar', {
        openFile, getTab: () => ({ id: 'editor' }),
      })
      injected.openReference(unscopedId, '.dsh/member-questions/question-1/brief.html', 'brief.html')
      expect(openFile).toHaveBeenLastCalledWith(
        { sessionId: unscopedId },
        '.dsh/member-questions/question-1/brief.html',
        'brief.html',
      )
      await disposeSidebarWithoutCwd()
    } finally {
      await fiber.dispose()
    }
    expect(ctx.slots.entries('conversation.input.dock')).toHaveLength(0)
  })

  it('tracks only visible active Files paths in their owning Session and releases subscriptions', async () => {
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('conversation.input.dock')[0]!
    const injected = (entry.inject as unknown as () => {
      hooks: { referenceView: { getSnapshot: () => MemberQuestionReferenceView; subscribe: (listener: () => void) => () => void } }
    })()
    const listener = vi.fn()
    const release = injected.hooks.referenceView.subscribe(listener)
    const stateListener = vi.fn()
    const registryListener = vi.fn()
    const releaseState = vi.fn()
    const releaseRegistry = vi.fn()
    let editorRegistered = true
    const sessionId = 'receiving-session'
    const snapshot = {
      sessionId,
      state: {
        panelOpen: true,
        bottomOpen: false,
        splits: {
          kind: 'leaf', id: 'right', active: 'reference',
          tabs: [{ id: 'reference', type: 'editor', title: 'brief', path: '/workspace/brief.md' }],
        },
        bottomSplits: { kind: 'leaf', id: 'bottom', active: null, tabs: [] },
        floats: [],
      },
    }
    const disposeSidebar = ctx.reflect.provide('betterSidebar', {
      getSnapshot: () => snapshot,
      getTab: (id: string) => id === 'editor' && editorRegistered ? { id: 'editor' } : undefined,
      subscribeState: (next: () => void) => { stateListener.mockImplementation(next); return releaseState },
      subscribe: (next: () => void) => { registryListener.mockImplementation(next); return releaseRegistry },
    })
    try {
      expect(injected.hooks.referenceView.getSnapshot()).toEqual({
        sessionId,
        paths: ['/workspace/brief.md'],
      })
      expect(listener).toHaveBeenCalledTimes(1)
      stateListener()
      expect(listener).toHaveBeenCalledTimes(2)

      editorRegistered = false
      registryListener()
      expect(injected.hooks.referenceView.getSnapshot()).toEqual({ paths: [] })
      editorRegistered = true
      registryListener()
      expect(injected.hooks.referenceView.getSnapshot()).toEqual({
        sessionId,
        paths: ['/workspace/brief.md'],
      })
    } finally {
      await disposeSidebar()
      release()
      await fiber.dispose()
    }
    expect(releaseState).toHaveBeenCalledTimes(1)
    expect(releaseRegistry).toHaveBeenCalledTimes(1)
  })
})

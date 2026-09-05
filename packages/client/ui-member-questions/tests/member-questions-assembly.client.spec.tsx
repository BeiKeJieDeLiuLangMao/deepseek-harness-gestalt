// @vitest-environment jsdom
// Assembled Card + question.presentation occupant: member apply declares the
// child, user-questions occupies it, Host settle fail keeps drafts, success
// plus a later snapshot change clears pending.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh, en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSlotRenderer } from '@deepseek-ai/dsh-client-ui-renderer/src/client/scoped-slots.tsx'
import type { PendingMemberQuestionView } from '@deepseek-ai/dsh-member-question-receiver/types'
import type { ReceivingQuestionBookView } from '@deepseek-ai/dsh-api-session-controller/src/client/sessions/receiving.ts'
import { apply as memberApply, inject as memberInject } from '../src/client/index.ts'
import { apply as questionApply, inject as questionInject } from '@deepseek-ai/dsh-client-ui-user-questions/src/client/index.ts'

afterEach(cleanup)

const SID = 'receiving-session' as SessionId

function pendingView(): PendingMemberQuestionView {
  return {
    questionId: 'question-1' as never,
    receivingSessionId: SID as never,
    receivingAccountId: 'account-receiver' as never,
    revision: 1,
    arrivedAt: 100,
    operation: {
      type: 'member-question',
      operationId: 'operation-1' as never,
      questionId: 'question-1' as never,
      projectId: 'project-1' as never,
      originSessionId: 'origin-session-1' as never,
      expiresAt: Date.now() + 125_000,
      origin: {
        projectName: '千帆平台',
        originSessionTitle: '整理迭代计划',
        askerAccountId: 'account-alice' as never,
        askerRole: 'admin',
        askerDisplayName: '王小明',
        askerAvatarUrl: '',
      },
      background: '该成员近 30 天无提交记录。',
      questions: [{
        id: 'remove-member',
        question: '将王小明移出项目吗？',
        options: [{ label: '移出 (recommended)' }, { label: '保留' }],
      }],
      references: [],
    },
  }
}

function bookView(pending?: PendingMemberQuestionView): ReceivingQuestionBookView {
  if (pending === undefined) {
    return {
      byId: {
        [SID]: {
          sessionId: SID,
          title: 'member-question',
          updatedAt: 200,
          revision: 2,
          materialized: false,
          pending: undefined,
          records: [{
            questionId: 'question-1',
            state: 'answered',
            askedAt: 100,
            terminalAt: 200,
            intent: { kind: 'member-question' } as never,
          }],
        },
      },
    }
  }
  return {
    byId: {
      [SID]: {
        sessionId: SID,
        title: 'member-question',
        updatedAt: 100,
        revision: pending.revision,
        materialized: false,
        pending,
        records: [],
      },
    },
  }
}

describe('assembled member dock and question.presentation', () => {
  it('keeps drafts on Host settle failure, retries, then clears pending after success', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.slots
    slots.install(createSlotRenderer())
    const locale = new LocaleRuntime(ctx)
    locale.setLocale('zh')
    locale.register('common', { zh: commonZh, en: commonEn })
    ctx.provide('locale', locale)
    slots.installLocale(locale)
    const binding = {
      key: SID,
      ctx,
      hooks: {},
      keyedHooks: {},
      props: { sessionId: SID },
    }
    slots.installScope('session', {
      current: { getSnapshot: () => binding, subscribe: () => () => {} },
      resolve: key => key === SID ? binding : undefined,
      renderArea: (_value, props) => props.children,
    })
    ctx.provide('workspaces', { openPath: vi.fn(async () => {}) })
    ctx.provide('sessions', {
      list: { getSnapshot: () => ({ byId: { [SID]: { cwd: '/ws' } } }) },
      scopeOf: () => SID,
    })
    ctx.provide('uiSession', { registerPendingInteraction: () => () => {} })
    ctx.provide('remote', { $on: () => () => {} })

    let view = bookView(pendingView())
    const listeners = new Set<() => void>()
    const settle = vi.fn()
      .mockRejectedValueOnce(new Error('exact payload required'))
      .mockImplementationOnce(async () => {
        view = bookView(undefined)
        for (const listener of [...listeners]) listener()
      })
    const receivingQuestions = {
      pending: () => view.byId[SID]?.pending,
      records: () => view.byId[SID]?.records ?? [],
      settle,
      decline: vi.fn(async () => {}),
      getSnapshot: () => view,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
    ctx.provide('receivingQuestions', receivingQuestions)
    ctx.receivingQuestions = receivingQuestions as never

    slots.register({
      name: 'root',
      children: {
        'conversation.composer': { kind: 'chain', scope: 'session' },
        'conversation.input.dock': { kind: 'list', scope: 'session' },
      },
    } as never, (props: {
      renderSlot: (key: string, owner: object) => unknown
    }) => props.renderSlot('conversation.input.dock', {
      session: {},
      input: { draft: '', phase: 'plain' },
    }))

    const questionFiber = ctx.plugin({ inject: [...questionInject], apply: questionApply })
    const memberFiber = ctx.plugin({ inject: [...memberInject], apply: memberApply })
    await questionFiber.await()
    await memberFiber.await()

    const mounted = render(<>{slots.renderSlot('root', {})}</>)
    try {
      expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy()
      fireEvent.click(screen.getByRole('radio', { name: '移出' }))
      fireEvent.click(screen.getByRole('button', { name: '提交' }))
      expect(await screen.findByText('exact payload required')).toBeTruthy()
      expect(screen.getByRole('radio', { name: '移出' }).getAttribute('aria-checked')).toBe('true')
      expect(settle).toHaveBeenCalledTimes(1)
      expect(settle.mock.calls[0]?.[1]).toEqual([
        { id: 'remove-member', selected: ['移出 (recommended)'] },
      ])

      fireEvent.click(screen.getByRole('button', { name: '提交' }))
      await waitFor(() => { expect(settle).toHaveBeenCalledTimes(2) })
      await waitFor(() => {
        expect(mounted.container.querySelector('[data-member-presentation]')).toBeNull()
      })
      expect(mounted.container.querySelector('[data-record-state="answered"]')).not.toBeNull()
    } finally {
      act(() => { mounted.unmount() })
      await memberFiber.dispose()
      await questionFiber.dispose()
    }
  })
})

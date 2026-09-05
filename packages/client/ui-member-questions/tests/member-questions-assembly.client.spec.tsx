// @vitest-environment jsdom
// Three real Client applies: session-controller registers ReceivingQuestionBook,
// member-questions declares the dock, user-questions occupies question.presentation.
// Only the generated memberQuestion Remote is fixture. Host snapshot renders the
// dock; submit goes through the book onto generated settle; fiber unload removes
// both the service and the dock.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh, en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSlotRenderer } from '@deepseek-ai/dsh-client-ui-renderer/src/client/scoped-slots.tsx'
import type { MemberQuestionReceiverSnapshot } from '@deepseek-ai/dsh-member-question-receiver/types'
import { memberQuestionRemoteSettleRequestSchema } from '../../../interaction/member-question-receiver/src/remote-schemas.ts'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { RemoteStream, type RemoteStreamOptions } from '@deepseek-ai/dsh-api-gateway/client'
import { ReceivingQuestionBook } from '../../../api/session-controller/src/client/sessions/receiving.ts'
import * as SessionClient from '../../../api/session-controller/src/client/index.ts'
import { apply as memberApply, inject as memberInject } from '../src/client/index.ts'
import { apply as questionApply, inject as questionInject } from '../../ui-user-questions/src/client/index.ts'
import { QuestionPresentationSlot } from '../../ui-user-questions/src/client/QuestionPresentationSlot.tsx'

afterEach(cleanup)

const SID = 'receiving-session' as SessionId

function hostPending(): MemberQuestionReceiverSnapshot['pending'][number] {
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

function snapshotOf(
  revision: number,
  pending: MemberQuestionReceiverSnapshot['pending'],
  terminal: MemberQuestionReceiverSnapshot['terminal'] = [],
): MemberQuestionReceiverSnapshot {
  return { revision, pending, terminal }
}

describe('three Client applies: session-controller, member-questions, user-questions', () => {
  it('renders Host snapshot through the dock occupant, settles the book, and unloads', async () => {
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
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
    ctx.provide('uiSession', { registerPendingInteraction: () => () => {} })

    let current = snapshotOf(1, [hostPending()])
    const listeners = new Map<string, Set<(...args: never[]) => void>>()
    const memberQuestion = {
      snapshot: vi.fn(async () => ({ ok: true as const, value: current })),
      settle: vi.fn(async (request: unknown) => {
        const parsed = memberQuestionRemoteSettleRequestSchema.safeParse(request)
        expect(parsed.success).toBe(true)
        current = snapshotOf(2, [], [{
          questionId: 'question-1' as never,
          receivingSessionId: SID as never,
          receivingAccountId: 'account-receiver' as never,
          revision: 2,
          arrivedAt: 100,
          brief: hostPending().operation,
          terminal: {
            type: 'member-question-settled',
            operationId: 'operation-1' as never,
            questionId: 'question-1' as never,
            outcome: 'answered',
            settledAt: 500,
            settledByInstallationId: 'installation-a' as never,
            settledByDeviceName: 'Desk A',
            answers: [{ id: 'remove-member', selected: ['移出 (recommended)'] }],
          },
        }])
        return {
          ok: true as const,
          value: current.terminal[0]!.terminal,
        }
      }),
    }
    const connection = {
      isLoopback: true,
      generation: {
        getSnapshot: () => ({ id: 1, host: { home: '/home/fixture' } }),
        subscribe: () => () => {},
      },
      state: { getSnapshot: () => 'connected' as const, subscribe: () => () => {} },
      rpc: { call: () => Promise.reject(new Error('unexpected generic RPC call')) },
      reconnect: () => {},
      registerGenerationSource: () => () => {},
      start: () => ({ stop: () => {} }),
    }
    const sessionRemote = {
      control: async function* (signal?: AbortSignal) {
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => { resolve() }, { once: true })
        })
      },
      follow: async function* () {},
      page: async () => ({ ok: true, value: { records: [], hasMore: false } }),
      list: async () => ({ ok: true, value: { items: [] } }),
      search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
      create: async () => ({ ok: true, value: { sessionId: SID } }),
      selectModel: async () => ({ ok: true, value: { selected: { provider: 'f', model: 'f' } } }),
      modelCatalog: async () => ({
        ok: true,
        value: { default: { provider: 'f', model: 'f' }, routableProviders: [], groups: [], failures: [] },
      }),
      rename: async () => ({ ok: true, value: { title: 't', seq: 0 } }),
      fork: async () => ({ ok: true, value: { sessionId: SID } }),
      prompt: async () => ({ ok: true, value: { accepted: true } }),
      attachment: async () => ({ ok: true, value: {} }),
      updateQueue: async () => ({ ok: true, value: { accepted: true } }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
      canOpenWorkspacePath: async () => ({ ok: true, value: false }),
      openWorkspacePath: async () => ({ ok: true, value: { opened: true } }),
    }
    ctx.reflect.provide('remote', {
      memberQuestion,
      commands: { execute: async () => ({ ok: true, value: undefined }) },
      session: sessionRemote,
      subagents: {
        list: async () => ({ ok: true, value: { entries: [], parentAvailable: true } }),
        prompt: async () => ({ ok: true, value: { messageId: 'm' } }),
        interruptByParent: async () => ({ ok: true, value: { accepted: true } }),
      },
      $stream: (options: RemoteStreamOptions<unknown>) => new RemoteStream(connection as never, options),
      $host: { home: '/home/fixture', isLoopback: true },
      $on: (event: string, listener: (...args: never[]) => void) => {
        const set = listeners.get(event) ?? new Set()
        listeners.set(event, set)
        set.add(listener)
        return () => { set.delete(listener) }
      },
    })
    ctx.reflect.provide('remote.commands', ctx.remote.commands)
    ctx.reflect.provide('remote.session', ctx.remote.session)
    ctx.reflect.provide('remote.subagents', ctx.remote.subagents)

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

    const sessionFiber = ctx.plugin(SessionClient)
    const questionFiber = ctx.plugin({ inject: [...questionInject], apply: questionApply })
    const memberFiber = ctx.plugin({ inject: [...memberInject], apply: memberApply })
    await sessionFiber
    await questionFiber.await()
    await memberFiber.await()

    expect(ctx.receivingQuestions).toBeInstanceOf(ReceivingQuestionBook)
    expect(slots.entries('question.presentation')[0]?.component).toBe(QuestionPresentationSlot)
    await vi.waitFor(() => {
      expect(ctx.receivingQuestions.pending(SID)?.questionId).toBe('question-1')
    })

    const mounted = render(<>{slots.renderSlot('root', {})}</>)
    try {
      expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy()
      expect(screen.getByText('远端')).toBeTruthy()
      expect(mounted.container.querySelector('[data-slot="question.presentation"]')).not.toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: '移出' }))
      fireEvent.click(screen.getByRole('button', { name: '提交' }))
      await waitFor(() => { expect(memberQuestion.settle).toHaveBeenCalledTimes(1) })
      expect(memberQuestion.settle.mock.calls[0]?.[0]).toMatchObject({
        receivingSessionId: SID,
        revision: 1,
        questionId: 'question-1',
        response: {
          kind: 'answered',
          answers: [{ id: 'remove-member', selected: ['移出 (recommended)'] }],
        },
      })
      await waitFor(() => {
        expect(mounted.container.querySelector('[data-member-presentation]')).toBeNull()
      })
      expect(ctx.receivingQuestions.pending(SID)).toBeUndefined()
    } finally {
      act(() => { mounted.unmount() })
      await memberFiber.dispose()
      await questionFiber.dispose()
      await sessionFiber.dispose()
    }
    expect(ctx.get('receivingQuestions')).toBeUndefined()
    expect(slots.entries('conversation.input.dock')).toHaveLength(0)
    expect(slots.entries('question.presentation')).toHaveLength(0)
  })
})

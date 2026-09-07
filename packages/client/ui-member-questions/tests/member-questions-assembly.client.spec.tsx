// @vitest-environment jsdom
// Three real Client applies: session-controller registers ReceivingQuestionBook,
// member-questions declares the dock, user-questions occupies question.presentation.
// Only the generated memberQuestion Remote is fixture. Host snapshot renders the
// dock; submit goes through the book onto generated settle; fiber unload removes
// both the service and the dock.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh, en as commonEn } from '../../locale/src/locales/index.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  chatSnapshot, conversationSnapshot, sessionSnapshot, workspaceSnapshot,
} from '@deepseek-ai/dsh-client-test-runtime'
import { createSlotRenderer } from '../../ui-renderer/src/client/scoped-slots.tsx'
import type { MemberQuestionReceiverSnapshot } from '@deepseek-ai/dsh-member-question-receiver/types'
import { memberQuestionRemoteSettleRequestSchema } from '../../../interaction/member-question-receiver/src/remote-schemas.ts'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { RemoteStream, type RemoteStreamOptions } from '@deepseek-ai/dsh-api-gateway/client'
import { ReceivingQuestionBook } from '@deepseek-ai/dsh-api-session-controller/client'
import * as SessionClient from '@deepseek-ai/dsh-api-session-controller/client'
import { apply as memberApply, inject as memberInject } from '../src/client/index.ts'
import { apply as questionApply, inject as questionInject } from '../../ui-user-questions/src/client/index.ts'
import { QuestionPresentationSlot } from '../../ui-user-questions/src/client/QuestionPresentationSlot.tsx'

afterEach(cleanup)

const SID = 'receiving-session' as SessionId

function bindSnapshot<Snapshot>(value: Snapshot): SnapshotSelectorHook<Snapshot> {
  return selector => selector(value)
}

const inputState: InputState = {
  draft: '', imageIds: [], draftRev: 0, phase: 'plain',
  occurrences: [], queue: [], annotations: [],
}

function hostPending(questionId = 'question-1', revision = 1): MemberQuestionReceiverSnapshot['pending'][number] {
  return {
    questionId: questionId as never,
    receivingSessionId: SID as never,
    receivingAccountId: 'account-receiver' as never,
    revision,
    arrivedAt: 100,
    operation: {
      type: 'member-question',
      operationId: `operation-${questionId}` as never,
      questionId: questionId as never,
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

    const session = sessionSnapshot(SID)
    const sessions: SessionListState = {
      ids: [SID],
      byId: {
        [SID]: { id: SID, displayTitle: 'Receiving', running: false, blank: false, updatedAt: 0 },
      },
      current: SID,
      phase: 'ready',
      subagentsByParent: {},
      jobsBySession: {},
      currentAddress: undefined,
    }
    const binding = {
      key: SID,
      ctx,
      hooks: {},
      keyedHooks: {},
      props: {
        sessionId: SID,
        useSession: bindSnapshot(session),
        useSessions: bindSnapshot(sessions),
        useSessionPendingInteraction: bindSnapshot(new Map()),
        useWorkspaces: bindSnapshot(workspaceSnapshot()),
        useConversation: bindSnapshot(conversationSnapshot()),
        useChat: bindSnapshot(chatSnapshot()),
        useTrajectory: bindSnapshot({
          eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(),
          partial: null, runningCalls: [],
        }),
        useProjection: () => undefined,
        useInput: bindSnapshot(inputState),
        inputActions: {
          setDraft: () => {}, addImages: () => false, removeImage: () => {}, pruneImages: () => {},
          submit: () => {}, addTextAnnotation: () => { throw new Error('unused') },
          updateTextAnnotation: () => {}, removeTextAnnotation: () => {}, discardTextAnnotations: () => {},
          addImagePin: () => { throw new Error('unused') }, updateImagePin: () => {},
        },
      },
    }
    slots.installScope('session', {
      current: { getSnapshot: () => binding, subscribe: () => () => {} },
      resolve: key => key === SID ? binding : undefined,
      renderArea: (_value, props) => props.children,
    })
    ctx.provide('uiSession', { registerPendingInteraction: () => () => {} })

    let current = snapshotOf(1, [hostPending()])
    const listeners = new Map<string, Set<(...args: never[]) => void>>()
    const memberQuestion = {
      snapshot: vi.fn(async () => ({ ok: true as const, value: current })),
      settle: vi.fn(async (request: unknown) => {
        const parsed = memberQuestionRemoteSettleRequestSchema.safeParse(request)
        expect(parsed.success).toBe(true)
        if (memberQuestion.settle.mock.calls.length === 1) {
          return {
            ok: false as const,
            error: { code: 'gateway/bad-request', message: 'exact payload required', details: {} },
          }
        }
        if (!parsed.success) throw new Error('member question request did not parse')
        const pending = current.pending[0]
        if (pending === undefined) throw new Error('member question fixture has no pending row')
        const nextRevision = current.revision + 1
        const terminal = parsed.data.response.kind === 'answered'
          ? {
            type: 'member-question-settled' as const,
            operationId: pending.operation.operationId,
            questionId: pending.questionId,
            outcome: 'answered' as const,
            settledAt: 500,
            settledByInstallationId: 'installation-a' as never,
            settledByDeviceName: 'Desk A',
            answers: parsed.data.response.answers,
          }
          : {
            type: 'member-question-settled' as const,
            operationId: pending.operation.operationId,
            questionId: pending.questionId,
            outcome: 'declined' as const,
            settledAt: 500,
            settledByInstallationId: 'installation-a' as never,
            settledByDeviceName: 'Desk A',
          }
        current = snapshotOf(nextRevision, [], [{
          questionId: pending.questionId,
          receivingSessionId: pending.receivingSessionId,
          receivingAccountId: pending.receivingAccountId,
          revision: nextRevision,
          arrivedAt: pending.arrivedAt,
          brief: pending.operation,
          terminal,
        }])
        return { ok: true as const, value: terminal }
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
    ctx.reflect.provide('remote.memberQuestion', memberQuestion)

    slots.register({
      name: 'root',
      children: {
        'conversation.composer': { kind: 'chain', scope: 'session' },
        'conversation.input.dock': { kind: 'list', scope: 'session' },
      },
    } as never, (props: PropsRenderSlots<'conversation.input.dock'>) => (
      props.renderSlot('conversation.input.dock', {
        session: sessionSnapshot(SID),
        input: {
          draft: '', imageIds: [], draftRev: 0, phase: 'plain',
          occurrences: [], queue: [], annotations: [],
        },
      })
    ))

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
      expect(await screen.findByText('exact payload required')).toBeTruthy()
      expect(screen.getByRole('radio', { name: '移出' }).getAttribute('aria-checked')).toBe('true')
      expect(memberQuestion.settle).toHaveBeenCalledTimes(1)
      expect(ctx.receivingQuestions.pending(SID)?.questionId).toBe('question-1')
      expect(memberQuestion.settle.mock.calls[0]?.[0]).toMatchObject({
        receivingSessionId: SID,
        revision: 1,
        questionId: 'question-1',
        response: {
          kind: 'answered',
          answers: [{ id: 'remove-member', selected: ['移出 (recommended)'] }],
        },
      })
      fireEvent.click(screen.getByRole('button', { name: '提交' }))
      await waitFor(() => { expect(memberQuestion.settle).toHaveBeenCalledTimes(2) })
      await waitFor(() => {
        expect(mounted.container.querySelector('[data-member-presentation]')).toBeNull()
      })
      expect(ctx.receivingQuestions.pending(SID)).toBeUndefined()

      current = snapshotOf(3, [hostPending('question-2', 3)])
      await act(async () => { await ctx.receivingQuestions.refresh() })
      expect(screen.getByText('将王小明移出项目吗？')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '放弃整组问题' }))
      await waitFor(() => { expect(memberQuestion.settle).toHaveBeenCalledTimes(3) })
      expect(memberQuestion.settle.mock.calls[2]?.[0]).toMatchObject({
        receivingSessionId: SID,
        revision: 3,
        questionId: 'question-2',
        response: { kind: 'declined' },
      })
      await waitFor(() => {
        expect(mounted.container.querySelector('[data-member-presentation]')).toBeNull()
      })
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

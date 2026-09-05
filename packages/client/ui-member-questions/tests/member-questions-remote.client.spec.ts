// @vitest-environment jsdom
/**
 * Generated memberQuestion Remote consumption from the member-questions apply
 * fiber: subscribe, initial snapshot, settle failure retains the draft,
 * forwarded changed refreshes, and unload refuses further writes.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime/src/remote.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { MemberQuestionRemoteController } from '../src/client/remote-controller.ts'
import { en as questionEn, zh as questionZh } from '@deepseek-ai/dsh-client-ui-user-questions/src/client/locales.ts'
import type {
  MemberQuestionReceiverSnapshot,
  MemberQuestionRemoteSettleRequest,
} from '@deepseek-ai/dsh-member-question-receiver/types'

const SNAPSHOT: MemberQuestionReceiverSnapshot = {
  revision: 1,
  pending: [{
    questionId: 'question-1' as MemberQuestionReceiverSnapshot['pending'][number]['questionId'],
    receivingSessionId: 'receiving-1' as MemberQuestionReceiverSnapshot['pending'][number]['receivingSessionId'],
    receivingAccountId: 'account-1' as MemberQuestionReceiverSnapshot['pending'][number]['receivingAccountId'],
    revision: 1,
    arrivedAt: 1_000,
    operation: {
      type: 'member-question',
      operationId: 'operation-1' as never,
      questionId: 'question-1' as never,
      projectId: 'project-1' as never,
      originSessionId: 'origin-1' as never,
      expiresAt: 2_000,
      origin: {
        projectName: 'Atlas',
        originSessionTitle: 'Choose storage',
        askerAccountId: 'account-asker' as never,
        askerRole: 'owner',
        askerDisplayName: 'Ada',
        askerAvatarUrl: 'https://example.test/ada.png',
      },
      background: 'Choose the durable owner.',
      questions: [{ id: 'choice', question: 'Which owner?' }],
      references: [],
    },
  }],
  terminal: [],
}

const SETTLE: MemberQuestionRemoteSettleRequest = {
  receivingSessionId: SNAPSHOT.pending[0]!.receivingSessionId,
  revision: 1,
  questionId: SNAPSHOT.pending[0]!.questionId,
  response: { kind: 'answered', answers: [{ id: 'choice', selected: ['Continue'] }] },
}

function envelope<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

describe('MemberQuestionRemoteController', () => {
  it('seeds from snapshot, retains the settle request on failure, and stops writes after dispose', async () => {
    const snapshot = vi.fn(async () => envelope(SNAPSHOT))
    const settle = vi.fn(async () => ({
      ok: false as const,
      error: new RemoteError('member-question/revision-stale', 'stale', {
        receivingSessionId: SETTLE.receivingSessionId,
        questionId: SETTLE.questionId,
        revision: SETTLE.revision,
      }),
    }))
    const ctx = {
      remote: { memberQuestion: { snapshot, settle } },
    } as ConstructorParameters<typeof MemberQuestionRemoteController>[0]
    const controller = new MemberQuestionRemoteController(ctx)
    expect(controller.getSnapshot().status).toBe('cold')
    expect(await controller.ensure()).toEqual({ ok: true })
    expect(controller.getSnapshot().snapshot?.revision).toBe(1)
    expect(snapshot).toHaveBeenCalledTimes(1)

    const failed = await controller.settle(SETTLE)
    expect(failed).toMatchObject({ ok: false, error: { code: 'member-question/revision-stale' } })
    expect(controller.getSnapshot().draft).toEqual(SETTLE)
    expect(settle).toHaveBeenCalledWith(SETTLE)

    settle.mockResolvedValueOnce(envelope({
      type: 'member-question-settled',
      operationId: 'operation-1',
      questionId: 'question-1',
      outcome: 'answered',
      settledAt: 1_000,
      settledByInstallationId: 'installation-host',
      settledByDeviceName: 'Host Mac',
      answers: [{ id: 'choice', selected: ['Continue'] }],
    }) as never)
    snapshot.mockResolvedValueOnce(envelope({ ...SNAPSHOT, revision: 2, pending: [] }))
    expect(await controller.retry()).toMatchObject({ ok: true, value: { outcome: 'answered' } })
    expect(controller.getSnapshot().draft).toBeNull()

    controller.dispose()
    expect(await controller.settle(SETTLE)).toMatchObject({ ok: false, error: { code: 'disposed' } })
    expect(settle).toHaveBeenCalledTimes(2)
  })
})

describe('ui-member-questions apply Remote wiring', () => {
  it('subscribes, loads snapshot, refreshes on changed, and stops writes after unload', async () => {
    const ctx = new Context()
    ctx.provide('workspaces', { openPath: async () => {} })
    ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: {} }) } })
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'conversation.input.dock': { kind: 'list', scope: 'session' } },
    } as never, (() => null) as never)
    const locale = new LocaleRuntime(ctx)
    locale.register('question', { zh: questionZh, en: questionEn })
    ctx.provide('locale', locale)
    ctx.slots.installLocale(locale)
    const snapshot = vi.fn(async () => envelope(SNAPSHOT))
    const settle = vi.fn(async () => ({
      ok: false as const,
      error: new RemoteError('gateway/bad-request', 'exact payload required', {}),
    }))
    const remote = new TestRemote(ctx, { memberQuestion: { snapshot, settle } })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('conversation.input.dock')[0]!
    const injected = (entry.inject as unknown as () => {
      ensure: () => Promise<unknown>
      settle: (request: MemberQuestionRemoteSettleRequest) => Promise<{ ok: boolean; error?: { code: string } }>
      retry: () => Promise<unknown>
      hooks: { memberQuestionRemote: MemberQuestionRemoteController }
    })()
    await injected.ensure()
    expect(snapshot).toHaveBeenCalled()
    expect(injected.hooks.memberQuestionRemote.getSnapshot().snapshot?.pending[0]?.questionId)
      .toBe('question-1')

    const failed = await injected.settle(SETTLE)
    expect(failed.ok).toBe(false)
    expect(failed.error?.code).toBe('gateway/bad-request')
    expect(injected.hooks.memberQuestionRemote.getSnapshot().draft).toEqual(SETTLE)

    snapshot.mockResolvedValueOnce(envelope({ ...SNAPSHOT, revision: 3, pending: [] }))
    remote.emit('member-question-receiver/changed', [{
      revision: 3,
      questionId: SETTLE.questionId,
      state: 'answered',
    }])
    await vi.waitFor(() => {
      expect(injected.hooks.memberQuestionRemote.getSnapshot().snapshot?.revision).toBe(3)
    })

    await fiber.dispose()
    expect(await injected.settle(SETTLE)).toMatchObject({ ok: false, error: { code: 'disposed' } })
    expect(settle).toHaveBeenCalledTimes(1)
  })
})

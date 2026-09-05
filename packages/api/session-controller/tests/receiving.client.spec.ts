/** Generated memberQuestion Remote is the only Host path for receiving pending projection. */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type {
  MemberQuestionReceiverSnapshot,
  MemberQuestionRemoteSettleRequest,
} from '@deepseek-ai/dsh-member-question-receiver/types'
import { ReceivingQuestionBook } from '../src/client/sessions/receiving.ts'

const operation = {
  type: 'member-question' as const,
  operationId: 'operation-1' as never,
  questionId: 'question-1' as never,
  projectId: 'project-1' as never,
  originSessionId: 'origin-session-1' as never,
  expiresAt: 10_000,
  origin: {
    projectName: 'Atlas',
    originSessionTitle: 'Release decision',
    askerAccountId: 'account-alice',
    askerRole: 'owner' as const,
    askerDisplayName: 'Alice',
    askerAvatarUrl: 'https://example.com/alice.png',
  },
  background: 'Choose the launch channel.',
  questions: [{ id: 'channel', question: 'Which channel?', options: [{ label: 'Canary' }, { label: 'Stable' }] }],
  references: [{ path: 'docs/architecture.md', reason: 'Rollout constraints' }],
}

const SESSION = 'receiving-host-1' as SessionId

function hostSnapshot(
  revision: number,
  state: 'pending' | 'answered' | 'declined' | 'expired' | 'withdrawn' | 'superseded',
  settledByInstallationId = 'installation-a',
): MemberQuestionReceiverSnapshot {
  const base = {
    questionId: operation.questionId,
    receivingSessionId: 'receiving-host-1' as never,
    receivingAccountId: 'account-receiver' as never,
    revision,
    arrivedAt: 100,
  }
  if (state === 'pending') return { revision, pending: [{ ...base, operation }], terminal: [] }
  const terminal = state === 'answered'
    ? {
      type: 'member-question-settled' as const,
      operationId: operation.operationId,
      questionId: operation.questionId,
      outcome: state,
      settledByInstallationId: settledByInstallationId as never,
      settledByDeviceName: settledByInstallationId === 'installation-a' ? 'Desk A' : 'Desk B',
      settledAt: 500,
      answers: [{ id: 'channel', selected: ['Canary'] }],
    }
    : state === 'declined'
      ? {
        type: 'member-question-settled' as const,
        operationId: operation.operationId,
        questionId: operation.questionId,
        outcome: state,
        settledByInstallationId: settledByInstallationId as never,
        settledByDeviceName: 'Desk A',
        settledAt: 500,
      }
      : {
        type: 'member-question-settled' as const,
        operationId: operation.operationId,
        questionId: operation.questionId,
        outcome: state,
        settledAt: 500,
      }
  return { revision, pending: [], terminal: [{ ...base, terminal, brief: operation }] }
}

function envelope<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function bench(options: {
  currentInstallationId?: string
  snapshotImpl?: () => Promise<{ ok: true; value: MemberQuestionReceiverSnapshot } | { ok: false; error: RemoteError }>
  settleImpl?: (request: MemberQuestionRemoteSettleRequest) => Promise<
    { ok: true; value: unknown } | { ok: false; error: RemoteError }
  >
} = {}) {
  let current = hostSnapshot(1, 'pending')
  const listeners = new Map<string, Set<(...args: never[]) => void>>()
  const snapshotFn = options.snapshotImpl ?? (async () => envelope(current))
  const settleFn = options.settleImpl ?? (async () => envelope({
    type: 'member-question-settled',
    operationId: operation.operationId,
    questionId: operation.questionId,
    outcome: 'answered',
    settledAt: 500,
    settledByInstallationId: 'installation-a',
    settledByDeviceName: 'Desk A',
    answers: [{ id: 'channel', selected: ['Canary'] }],
  }))
  const snapshotCall = vi.fn(snapshotFn)
  const settle = vi.fn(settleFn)
  const ctx = {
    remote: {
      memberQuestion: { snapshot: snapshotCall, settle },
      $on: (event: string, listener: (...args: never[]) => void) => {
        const set = listeners.get(event) ?? new Set()
        listeners.set(event, set)
        set.add(listener)
        return () => { set.delete(listener) }
      },
    },
  }
  const book = new ReceivingQuestionBook(ctx, {
    ...(options.currentInstallationId === undefined
      ? {}
      : { currentInstallationId: options.currentInstallationId }),
  })
  return {
    book,
    snapshot: snapshotCall,
    settle,
    setSnapshot(next: MemberQuestionReceiverSnapshot) { current = next },
    emitChanged(change: { revision: number; questionId: string; state: string }) {
      for (const listener of [...(listeners.get('member-question-receiver/changed') ?? [])]) {
        listener(change as never)
      }
    },
  }
}

describe('ReceivingQuestionBook generated Remote', () => {
  it('projects one JSON pending row from the generated snapshot', async () => {
    const { book, snapshot } = bench()
    await book.start()
    expect(snapshot).toHaveBeenCalledTimes(1)
    const pending = book.pending(SESSION)
    expect(pending).toMatchObject({
      receivingSessionId: SESSION,
      questionId: 'question-1',
      revision: 1,
    })
    expect(pending?.operation.questions[0]?.id).toBe('channel')
    expect(book.records(SESSION)).toEqual([])
  })

  it('keeps the JSON pending row when generated settle fails', async () => {
    const { book, settle } = bench({
      settleImpl: async () => ({
        ok: false,
        error: new RemoteError('gateway/bad-request', 'exact payload required', {}),
      }),
    })
    await book.start()
    const pending = book.pending(SESSION)!
    await expect(book.settle(SESSION, [{ id: 'channel', selected: ['Canary'] }]))
      .rejects.toThrow('exact payload required')
    expect(settle).toHaveBeenCalledWith({
      receivingSessionId: 'receiving-host-1',
      revision: 1,
      questionId: 'question-1',
      response: { kind: 'answered', answers: [{ id: 'channel', selected: ['Canary'] }] },
    })
    await expect(book.settle(SESSION, [{ id: 'channel', selected: ['Stable'] }]))
      .rejects.toThrow('exact payload required')
    expect(settle).toHaveBeenCalledTimes(2)
    expect(book.pending(SESSION)).toEqual(pending)
  })

  it('rejects a stale revision through generated settle and refreshes', async () => {
    const { book, settle, setSnapshot, snapshot } = bench({
      settleImpl: async () => ({
        ok: false,
        error: new RemoteError('member-question/revision-stale', 'stale', {
          receivingSessionId: 'receiving-host-1' as never,
          questionId: 'question-1' as never,
          revision: 1,
        }),
      }),
    })
    await book.start()
    setSnapshot(hostSnapshot(2, 'pending'))
    await expect(book.settle(SESSION, [{ id: 'channel', selected: ['Canary'] }]))
      .rejects.toMatchObject({ message: 'stale' })
    expect(settle.mock.calls[0]?.[0]).toMatchObject({ revision: 1 })
    await vi.waitFor(() => {
      expect(snapshot).toHaveBeenCalledTimes(2)
    })
  })

  it('removes the pending row when changed reports a terminal', async () => {
    let current = hostSnapshot(1, 'pending')
    const { book, emitChanged, snapshot: snapshotFn } = bench({
      snapshotImpl: async () => envelope(current),
    })
    await book.start()
    expect(book.pending(SESSION)).toBeDefined()
    current = hostSnapshot(2, 'expired')
    emitChanged({ revision: 2, questionId: 'question-1', state: 'expired' })
    await vi.waitFor(() => {
      expect(book.pending(SESSION)).toBeUndefined()
    })
    expect(book.records(SESSION)).toMatchObject([
      { state: 'expired', terminalAt: 500 },
    ])
    expect(snapshotFn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('stops settle after dispose', async () => {
    const { book, settle } = bench()
    await book.start()
    expect(book.pending(SESSION)).toBeDefined()
    book.dispose()
    await expect(book.settle(SESSION, [{ id: 'channel', selected: ['Canary'] }]))
      .rejects.toThrow(/disposed/)
    expect(settle).toHaveBeenCalledTimes(0)
    expect(book.pending(SESSION)).toBeUndefined()
  })

  it('derives answered-elsewhere from Host Installation identity on the snapshot', async () => {
    const first = bench({ currentInstallationId: 'installation-a' })
    const second = bench({ currentInstallationId: 'installation-b' })
    first.setSnapshot(hostSnapshot(2, 'answered', 'installation-a'))
    second.setSnapshot(hostSnapshot(2, 'answered', 'installation-a'))
    await first.book.start()
    await second.book.start()
    expect(first.book.records(SESSION)).toEqual([])
    expect(second.book.records(SESSION)).toMatchObject([{
      state: 'answered-elsewhere', settledByDeviceName: 'Desk A', terminalAt: 500,
    }])
  })
})

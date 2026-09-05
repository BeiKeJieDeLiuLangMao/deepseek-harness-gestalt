import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPendingInvitationsSource } from '../src/client/pending-invitations-source.ts'
import type { WorkspacePendingInvitation } from '../src/client/contract/slots.ts'

afterEach(() => {
  vi.useRealTimers()
})

const card = (id: string): WorkspacePendingInvitation => ({
  invitationId: id,
  receivingAccountId: 'account-2',
  projectId: 'project-1',
  projectName: 'Assembled',
  inviterName: 'mona',
  remoteUrl: 'https://github.com/o/repo',
  grantedRole: 'admin',
})

describe('createPendingInvitationsSource', () => {
  it('does not poll after dispose and ignores in-flight completion', async () => {
    vi.useFakeTimers()
    let resolve!: (value: readonly WorkspacePendingInvitation[]) => void
    const pending = new Promise<readonly WorkspacePendingInvitation[]>((next) => { resolve = next })
    const pendingInvitations = vi.fn(() => pending)
    const client = { pendingInvitations }
    const source = createPendingInvitationsSource(() => client, 15_000)
    const notified = vi.fn()
    source.source.subscribe(notified)
    source.start()
    expect(pendingInvitations).toHaveBeenCalledOnce()
    source.dispose()
    resolve([card('invitation-1')])
    await Promise.resolve()
    expect(notified).not.toHaveBeenCalled()
    expect(source.source.getSnapshot()).toEqual({ invitations: [], epoch: 0 })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(pendingInvitations).toHaveBeenCalledOnce()
  })

  it('keeps a single in-flight request and retries after failure', async () => {
    vi.useFakeTimers()
    let rejectFirst!: (reason: unknown) => void
    const first = new Promise<readonly WorkspacePendingInvitation[]>((_, reject) => { rejectFirst = reject })
    const pendingInvitations = vi.fn<(...args: unknown[]) => Promise<readonly WorkspacePendingInvitation[]>>()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce([card('invitation-1')])
    const client = { pendingInvitations }
    const source = createPendingInvitationsSource(() => client, 15_000)
    source.start()
    expect(pendingInvitations).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(pendingInvitations).toHaveBeenCalledTimes(1)
    rejectFirst(new Error('unavailable'))
    await Promise.resolve()
    expect(source.source.getSnapshot().invitations).toEqual([])
    await vi.advanceTimersByTimeAsync(15_000)
    await Promise.resolve()
    expect(pendingInvitations).toHaveBeenCalledTimes(2)
    expect(source.source.getSnapshot().invitations).toEqual([card('invitation-1')])
    source.dispose()
  })

  it('drops a stale reply after the membership client is replaced', async () => {
    vi.useFakeTimers()
    let resolveFirst!: (value: readonly WorkspacePendingInvitation[]) => void
    const first = new Promise<readonly WorkspacePendingInvitation[]>((next) => { resolveFirst = next })
    const firstClient = { pendingInvitations: vi.fn(() => first) }
    const secondClient = { pendingInvitations: vi.fn(async () => [card('invitation-2')]) }
    let current: typeof firstClient | typeof secondClient | undefined = firstClient
    const source = createPendingInvitationsSource(() => current, 15_000)
    const snapshots: string[][] = []
    source.source.subscribe(() => {
      snapshots.push(source.source.getSnapshot().invitations.map(invitation => invitation.invitationId))
    })
    source.start()
    current = secondClient
    source.notifyProviderChange()
    await Promise.resolve()
    resolveFirst([card('invitation-1')])
    await Promise.resolve()
    expect(snapshots).toEqual([['invitation-2']])
    expect(source.source.getSnapshot().invitations.map(invitation => invitation.invitationId)).toEqual(['invitation-2'])
    source.dispose()
  })

  it('does not notify when an empty list stays empty', async () => {
    vi.useFakeTimers()
    const pendingInvitations = vi.fn(async () => [])
    const client = { pendingInvitations }
    const source = createPendingInvitationsSource(() => client, 15_000)
    source.start()
    await Promise.resolve()
    const first = source.source.getSnapshot()
    const notified = vi.fn()
    source.source.subscribe(notified)
    await vi.advanceTimersByTimeAsync(15_000)
    await Promise.resolve()
    expect(notified).not.toHaveBeenCalled()
    expect(source.source.getSnapshot()).toBe(first)
    source.dispose()
  })

  it('reuses the invitation list and bumps epoch when the same view is offered again', async () => {
    vi.useFakeTimers()
    const pendingInvitations = vi.fn(async () => [card('invitation-1')])
    const client = { pendingInvitations }
    const source = createPendingInvitationsSource(() => client, 15_000)
    source.start()
    await Promise.resolve()
    const first = source.source.getSnapshot()
    await vi.advanceTimersByTimeAsync(15_000)
    await Promise.resolve()
    const second = source.source.getSnapshot()
    expect(second.invitations).toBe(first.invitations)
    expect(second.epoch).toBe(first.epoch + 1)
    source.dispose()
  })

  it('replaces the snapshot when the same invitation id reports a new project name', async () => {
    vi.useFakeTimers()
    const pendingInvitations = vi.fn<(...args: unknown[]) => Promise<readonly WorkspacePendingInvitation[]>>()
      .mockResolvedValueOnce([card('invitation-1')])
      .mockResolvedValueOnce([{ ...card('invitation-1'), projectName: 'Renamed' }])
    const client = { pendingInvitations }
    const source = createPendingInvitationsSource(() => client, 15_000)
    source.start()
    await Promise.resolve()
    expect(source.source.getSnapshot().invitations[0]?.projectName).toBe('Assembled')
    await vi.advanceTimersByTimeAsync(15_000)
    await Promise.resolve()
    expect(source.source.getSnapshot().invitations).toEqual([{ ...card('invitation-1'), projectName: 'Renamed' }])
    source.dispose()
  })

  it('does not let a stale generation clear the replacement provider flight lock', async () => {
    vi.useFakeTimers()
    let resolveFirst!: (value: readonly WorkspacePendingInvitation[]) => void
    let rejectFirst!: (reason: unknown) => void
    const first = new Promise<readonly WorkspacePendingInvitation[]>((next, reject) => {
      resolveFirst = next
      rejectFirst = reject
    })
    let resolveSecond!: (value: readonly WorkspacePendingInvitation[]) => void
    const second = new Promise<readonly WorkspacePendingInvitation[]>((next) => { resolveSecond = next })
    const firstClient = { pendingInvitations: vi.fn(() => first) }
    const secondClient = { pendingInvitations: vi.fn(() => second) }
    let current: typeof firstClient | typeof secondClient | undefined = firstClient
    const source = createPendingInvitationsSource(() => current, 15_000)
    source.start()
    expect(firstClient.pendingInvitations).toHaveBeenCalledOnce()
    current = secondClient
    source.notifyProviderChange()
    expect(secondClient.pendingInvitations).toHaveBeenCalledOnce()
    resolveFirst([card('invitation-1')])
    await Promise.resolve()
    expect(source.source.getSnapshot().invitations).toEqual([])
    await vi.advanceTimersByTimeAsync(15_000)
    expect(secondClient.pendingInvitations).toHaveBeenCalledOnce()
    rejectFirst(new Error('stale'))
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(secondClient.pendingInvitations).toHaveBeenCalledOnce()
    resolveSecond([card('invitation-2')])
    await Promise.resolve()
    expect(source.source.getSnapshot().invitations).toEqual([card('invitation-2')])
    source.dispose()
  })
})

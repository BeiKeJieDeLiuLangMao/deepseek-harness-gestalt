import { describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  FunctionTag, InvitationId, InvitationView, MembershipId, ProjectId, ProjectRole,
} from '@deepseek-ai/dsh-project-membership'
import type {
  IssuedInvitationView, PendingInvitationView, PlatformAccountId, ProjectMembershipClient, RosterMemberView,
} from '@deepseek-ai/dsh-project-membership-client'
import { membershipGatewayOf } from '../src/client/membership-gateway.ts'

const projectId = brandString<ProjectId>('project-1')
const invitationId = brandString<InvitationId>('invitation-1')
const issuedInvitationId = brandString<InvitationId>('invitation-2')
const pendingInvitationId = brandString<InvitationId>('invitation-3')
const membershipId = brandString<MembershipId>('membership-1')
const accountId = brandString<PlatformAccountId>('account-1')
const inviteeAccountId = brandString<PlatformAccountId>('account-2')

const invitationView = (id: InvitationId, grantedRole: Exclude<ProjectRole, 'owner'>): InvitationView => ({
  id,
  projectId,
  inviterAccountId: accountId,
  inviteeAccountId,
  state: 'pending',
  grantedRole,
  invitedAt: 1,
})

const rosterMember = (): RosterMemberView => ({
  id: membershipId,
  accountId,
  displayName: 'octocat',
  avatarRef: '',
  role: 'owner',
  tags: [brandString<FunctionTag>('platform')],
  presence: 'online',
  joinedAt: 1,
})

const issuedRow = (): IssuedInvitationView => ({
  invitationId: issuedInvitationId,
  inviteeName: 'mona',
  grantedRole: 'member',
  invitedAt: 1,
})

const pendingRow = (): PendingInvitationView => ({
  invitationId: pendingInvitationId,
  receivingAccountId: inviteeAccountId,
  projectId,
  projectName: 'Assembled',
  inviterName: 'mona',
  remoteUrl: 'https://github.com/o/repo',
  grantedRole: 'admin',
  invitedAt: 1,
})

function client(overrides: Partial<ProjectMembershipClient> = {}): ProjectMembershipClient {
  return {
    createProject: vi.fn(),
    projectByRemote: vi.fn(),
    roster: vi.fn(async () => ({
      project: { id: projectId, name: 'Assembled', boundRemoteUrl: 'https://github.com/o/repo', createdAt: 1 },
      members: [rosterMember()],
    })),
    heartbeat: vi.fn(),
    closePresence: vi.fn(),
    invite: vi.fn(async () => invitationView(invitationId, 'admin')),
    decideInvitation: vi.fn(async () => undefined),
    retractInvitation: vi.fn(async () => undefined),
    pendingInvitations: vi.fn(async () => [pendingRow()]),
    issuedInvitations: vi.fn(async () => [issuedRow()]),
    changeRole: vi.fn(async () => undefined),
    setMemberTags: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('membershipGatewayOf', () => {
  it('uses the submitted GitHub login as inviteeName when create-invite returns no display name', async () => {
    const membership = client({
      invite: vi.fn(async () => invitationView(invitationId, 'admin')),
    })
    const gateway = membershipGatewayOf(membership)
    await expect(gateway.invite({
      projectId: 'project-1', githubLogin: 'mona', grantedRole: 'admin',
    })).resolves.toEqual({ invitationId: 'invitation-1', inviteeName: 'mona', grantedRole: 'admin' })
    expect(membership.invite).toHaveBeenCalledWith({
      projectId, githubLogin: 'mona', grantedRole: 'admin',
    })
    const issued = await membership.invite.mock.results[0]?.value as InvitationView
    expect(issued).not.toHaveProperty('inviteeName')
  })

  it('forwards roster, issued invitations, pending cards, and decline', async () => {
    const membership = client()
    const gateway = membershipGatewayOf(membership)
    await expect(gateway.roster('project-1')).resolves.toEqual({
      project: { id: 'project-1', name: 'Assembled', boundRemoteUrl: 'https://github.com/o/repo' },
      members: [{
        membershipId: 'membership-1',
        accountId: 'account-1',
        displayName: 'octocat',
        avatarRef: '',
        role: 'owner',
        tags: ['platform'],
        presence: 'online',
      }],
    })
    await gateway.decideInvitation('invitation-3', { decision: 'decline' })
    expect(membership.decideInvitation).toHaveBeenCalledWith(pendingInvitationId, { decision: 'decline' })
    await expect(gateway.pendingInvitations()).resolves.toEqual([{
      invitationId: 'invitation-3',
      receivingAccountId: 'account-2',
      projectId: 'project-1',
      projectName: 'Assembled',
      inviterName: 'mona',
      remoteUrl: 'https://github.com/o/repo',
      grantedRole: 'admin',
    }])
    await expect(gateway.issuedInvitations('project-1')).resolves.toEqual([
      { invitationId: 'invitation-2', inviteeName: 'mona', grantedRole: 'member' },
    ])
    await gateway.retractInvitation('invitation-2')
    await gateway.changeRole('membership-1', 'admin')
    await gateway.setMemberTags('membership-1', ['platform'])
    await gateway.removeMember('membership-1')
    expect(membership.retractInvitation).toHaveBeenCalledWith(issuedInvitationId)
    expect(membership.changeRole).toHaveBeenCalledWith(membershipId, 'admin')
    expect(membership.setMemberTags).toHaveBeenCalledWith(membershipId, [brandString<FunctionTag>('platform')])
    expect(membership.removeMember).toHaveBeenCalledWith(membershipId)
  })

  it('forwards accept-with-link as the membership-client link body', async () => {
    const membership = client()
    const gateway = membershipGatewayOf(membership)
    await gateway.decideInvitation('invitation-3', {
      decision: 'accept-with-link',
      localWorkspaceId: 'ws' as never,
      receivingAccountId: 'account-2',
      projectId: 'project-1',
      link: { workspaceName: 'deepseek-harness', normalizedRemoteUrl: 'https://github.com/o/repo' },
    })
    expect(membership.decideInvitation).toHaveBeenCalledWith(pendingInvitationId, {
      decision: 'accept-with-link',
      link: { workspaceName: 'deepseek-harness', normalizedRemoteUrl: 'https://github.com/o/repo' },
    })
  })

  it('resolves the current client on each call and rejects while unbound', async () => {
    let current: ReturnType<typeof client> | undefined
    const gateway = membershipGatewayOf(() => current)
    await expect(gateway.pendingInvitations())
      .rejects.toThrow('requires a membership client')
    current = client()
    await expect(gateway.pendingInvitations()).resolves.toHaveLength(1)
    const replacement = client({
      pendingInvitations: vi.fn(async () => []),
    })
    current = replacement
    await expect(gateway.pendingInvitations()).resolves.toEqual([])
    expect(replacement.pendingInvitations).toHaveBeenCalledOnce()
  })

  it('rejects workspace-keyed Git methods that Host membership does not provide', async () => {
    const gateway = membershipGatewayOf(client())
    await expect(gateway.createProject({ name: 'Assembled', localWorkspaceId: 'ws' as never }))
      .rejects.toThrow('ProjectMembershipGateway.createProject requires Host workspace Git (#590)')
    await expect(gateway.projectForWorkspace('ws' as never))
      .rejects.toThrow('ProjectMembershipGateway.projectForWorkspace requires Host workspace Git (#590)')
    await expect(gateway.localRemoteFor('ws' as never))
      .rejects.toThrow('ProjectMembershipGateway.localRemoteFor requires Host workspace Git (#590)')
    await expect(gateway.cloneWorkspace({ remoteUrl: 'https://github.com/o/repo', directoryName: 'repo' }))
      .rejects.toThrow('ProjectMembershipGateway.cloneWorkspace requires Host workspace Git (#590)')
  })
})

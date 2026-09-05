import { describe, expect, it, vi } from 'vitest'
import { membershipGatewayOf, type ProjectMembershipClientFace } from '../src/client/membership-gateway.ts'

function client(overrides: Partial<ProjectMembershipClientFace> = {}): ProjectMembershipClientFace {
  return {
    roster: vi.fn(async () => ({
      project: { id: 'project-1', name: 'Assembled', boundRemoteUrl: 'https://github.com/o/repo' },
      members: [{
        id: 'membership-1',
        accountId: 'account-1',
        displayName: 'octocat',
        avatarRef: '',
        role: 'owner' as const,
        tags: ['platform'],
        presence: 'online' as const,
      }],
    })),
    invite: vi.fn(async () => ({ id: 'invitation-1', inviteeName: 'mona', grantedRole: 'admin' as const })),
    issuedInvitations: vi.fn(async () => [{ invitationId: 'invitation-2', inviteeName: 'mona', grantedRole: 'member' as const }]),
    retractInvitation: vi.fn(async () => undefined),
    decideInvitation: vi.fn(async () => undefined),
    changeRole: vi.fn(async () => undefined),
    setMemberTags: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
    pendingInvitations: vi.fn(async () => [{
      invitationId: 'invitation-3',
      receivingAccountId: 'account-2',
      projectId: 'project-1',
      projectName: 'Assembled',
      inviterName: 'mona',
      remoteUrl: 'https://github.com/o/repo',
      grantedRole: 'admin' as const,
    }]),
    ...overrides,
  }
}

describe('membershipGatewayOf', () => {
  it('forwards roster, invite, pending, and decline callbacks without wrapping the client object', async () => {
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
    await expect(gateway.invite({
      projectId: 'project-1', githubLogin: 'mona', grantedRole: 'admin',
    })).resolves.toEqual({ invitationId: 'invitation-1', inviteeName: 'mona', grantedRole: 'admin' })
    await gateway.decideInvitation('invitation-3', { decision: 'decline' })
    expect(membership.decideInvitation).toHaveBeenCalledWith('invitation-3', { decision: 'decline' })
    await expect(gateway.pendingInvitations()).resolves.toHaveLength(1)
    await expect(gateway.issuedInvitations('project-1')).resolves.toEqual([
      { invitationId: 'invitation-2', inviteeName: 'mona', grantedRole: 'member' },
    ])
    await gateway.retractInvitation('invitation-2')
    await gateway.changeRole('membership-1', 'admin')
    await gateway.setMemberTags('membership-1', ['platform'])
    await gateway.removeMember('membership-1')
    expect(membership.retractInvitation).toHaveBeenCalledWith('invitation-2')
    expect(membership.changeRole).toHaveBeenCalledWith('membership-1', 'admin')
    expect(membership.setMemberTags).toHaveBeenCalledWith('membership-1', ['platform'])
    expect(membership.removeMember).toHaveBeenCalledWith('membership-1')
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
    expect(membership.decideInvitation).toHaveBeenCalledWith('invitation-3', {
      decision: 'accept-with-link',
      link: { workspaceName: 'deepseek-harness', normalizedRemoteUrl: 'https://github.com/o/repo' },
    })
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

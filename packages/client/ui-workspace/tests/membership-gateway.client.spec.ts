import { describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  FunctionTag, InvitationId, InvitationView, MembershipId, ProjectId, ProjectRole,
} from '@deepseek-ai/dsh-project-membership'
import {
  localWorkspaceRemoteUrl,
  normalizeGitRemoteUrl,
  type AuthenticatedProjectView,
  type IssuedInvitationView,
  type PendingInvitationView,
  type PlatformAccountId,
  type ProjectMembershipClient,
  type RosterMemberView,
} from '@deepseek-ai/dsh-project-membership-client'
import { membershipGatewayOf, type MembershipWorkspaceGit } from '../src/client/membership-gateway.ts'

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

const authenticatedProject = (boundRemoteUrl: string): AuthenticatedProjectView => ({
  id: projectId,
  name: 'Assembled',
  boundRemoteUrl,
  createdAt: 1,
  receivingAccountId: accountId,
})

function workspaceGit(overrides: Partial<MembershipWorkspaceGit> = {}): MembershipWorkspaceGit {
  return {
    gitRemote: vi.fn(async () => ({ ok: true as const, value: {} })),
    cloneGit: vi.fn(),
    pickParentDirectory: vi.fn(async () => ({ ok: true as const, value: '/projects' })),
    ...overrides,
  }
}

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
    const invite = vi.fn(async () => invitationView(invitationId, 'admin'))
    const membership = client({
      invite,
    })
    const gateway = membershipGatewayOf(membership, workspaceGit())
    await expect(gateway.invite({
      projectId: 'project-1', githubLogin: 'mona', grantedRole: 'admin',
    })).resolves.toEqual({ invitationId: 'invitation-1', inviteeName: 'mona', grantedRole: 'admin' })
    expect(invite).toHaveBeenCalledWith({
      projectId, githubLogin: 'mona', grantedRole: 'admin',
    })
    const inviteResult = invite.mock.results[0]
    if (inviteResult?.type !== 'return') throw new Error('Expected the invitation call to return')
    const issued = await inviteResult.value
    expect(issued).not.toHaveProperty('inviteeName')
  })

  it('forwards roster, issued invitations, pending cards, and decline', async () => {
    const membership = client()
    const decideInvitationSpy = vi.spyOn(membership, 'decideInvitation')
    const retractInvitationSpy = vi.spyOn(membership, 'retractInvitation')
    const changeRoleSpy = vi.spyOn(membership, 'changeRole')
    const setMemberTagsSpy = vi.spyOn(membership, 'setMemberTags')
    const removeMemberSpy = vi.spyOn(membership, 'removeMember')
    const gateway = membershipGatewayOf(membership, workspaceGit())
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
    expect(decideInvitationSpy).toHaveBeenCalledWith(pendingInvitationId, { decision: 'decline' })
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
    expect(retractInvitationSpy).toHaveBeenCalledWith(issuedInvitationId)
    expect(changeRoleSpy).toHaveBeenCalledWith(membershipId, 'admin')
    expect(setMemberTagsSpy).toHaveBeenCalledWith(membershipId, [brandString<FunctionTag>('platform')])
    expect(removeMemberSpy).toHaveBeenCalledWith(membershipId)
  })

  it('forwards accept-with-link as the membership-client link body', async () => {
    const membership = client()
    const decideInvitationSpy = vi.spyOn(membership, 'decideInvitation')
    const gateway = membershipGatewayOf(membership, workspaceGit())
    await gateway.decideInvitation('invitation-3', {
      decision: 'accept-with-link',
      localWorkspaceId: 'ws' as never,
      receivingAccountId: 'account-2',
      projectId: 'project-1',
      link: { workspaceName: 'deepseek-harness', normalizedRemoteUrl: 'https://github.com/o/repo' },
    })
    expect(decideInvitationSpy).toHaveBeenCalledWith(pendingInvitationId, {
      decision: 'accept-with-link',
      link: { workspaceName: 'deepseek-harness', normalizedRemoteUrl: 'https://github.com/o/repo' },
    })
  })

  it('resolves the current client on each call and rejects while unbound', async () => {
    let current: ReturnType<typeof client> | undefined
    const gateway = membershipGatewayOf(() => current, workspaceGit())
    await expect(gateway.pendingInvitations())
      .rejects.toThrow('requires a membership client')
    current = client()
    await expect(gateway.pendingInvitations()).resolves.toHaveLength(1)
    const replacement = client({
      pendingInvitations: vi.fn(async () => []),
    })
    const pendingInvitationsSpy = vi.spyOn(replacement, 'pendingInvitations')
    current = replacement
    await expect(gateway.pendingInvitations()).resolves.toEqual([])
    expect(pendingInvitationsSpy).toHaveBeenCalledOnce()
  })

  it('canonicalizes a Host origin that still carries .git', async () => {
    const gitRemote = vi.fn(async () => ({
      ok: true as const,
      value: { remoteUrl: 'https://github.com/o/repo.git' },
    }))
    const gateway = membershipGatewayOf(client(), workspaceGit({ gitRemote }))
    await expect(gateway.localRemoteFor('ws' as never)).resolves.toBe('https://github.com/o/repo')
  })

  it('uses origin when present and local://workspace/<id> when Git reports none', async () => {
    const origin = 'https://github.com/Org/Repo.git'
    const canonical = normalizeGitRemoteUrl(origin)
    const gitRemote = vi.fn(async () => ({ ok: true as const, value: { remoteUrl: origin } }))
    const createProject = vi.fn(async () => authenticatedProject(canonical))
    const projectByRemote = vi.fn(async () => authenticatedProject(canonical))
    const withOrigin = membershipGatewayOf(client({ createProject, projectByRemote }), workspaceGit({ gitRemote }))
    await expect(withOrigin.localRemoteFor('ws' as never)).resolves.toBe(canonical)
    await expect(withOrigin.createProject({ name: 'Assembled', localWorkspaceId: 'ws' as never }))
      .resolves.toEqual({
        id: 'project-1',
        name: 'Assembled',
        boundRemoteUrl: 'https://github.com/Org/Repo',
        receivingAccountId: 'account-1',
      })
    expect(createProject).toHaveBeenCalledWith({ name: 'Assembled', remoteUrl: canonical })
    await expect(withOrigin.projectForWorkspace('ws' as never)).resolves.toMatchObject({
      id: 'project-1', receivingAccountId: 'account-1',
    })
    expect(projectByRemote).toHaveBeenCalledWith(canonical)

    const absent = vi.fn(async () => ({ ok: true as const, value: {} }))
    const createLocal = vi.fn(async () => authenticatedProject(localWorkspaceRemoteUrl('ws')))
    const lookupLocal = vi.fn(async () => undefined)
    const withoutOrigin = membershipGatewayOf(
      client({ createProject: createLocal, projectByRemote: lookupLocal }),
      workspaceGit({ gitRemote: absent }),
    )
    await expect(withoutOrigin.localRemoteFor('ws' as never)).resolves.toBeUndefined()
    await expect(withoutOrigin.createProject({ name: 'Assembled', localWorkspaceId: 'ws' as never }))
      .resolves.toMatchObject({ boundRemoteUrl: 'local://workspace/ws' })
    expect(createLocal).toHaveBeenCalledWith({ name: 'Assembled', remoteUrl: 'local://workspace/ws' })
    await expect(withoutOrigin.projectForWorkspace('ws' as never)).resolves.toBeUndefined()
    expect(lookupLocal).toHaveBeenCalledWith('local://workspace/ws')
  })

  it('returns undefined when clone parent pick is cancelled and maps a registered clone', async () => {
    const cloneGit = vi.fn()
    const cancelled = membershipGatewayOf(client(), workspaceGit({
      pickParentDirectory: vi.fn(async () => ({ ok: true as const, value: null })),
      cloneGit,
    }))
    await expect(cancelled.cloneWorkspace({ remoteUrl: 'https://github.com/o/repo', directoryName: 'repo' }))
      .resolves.toBeUndefined()
    expect(cloneGit).not.toHaveBeenCalled()

    const cloned = membershipGatewayOf(client(), workspaceGit({
      pickParentDirectory: vi.fn(async () => ({ ok: true as const, value: '/projects' })),
      cloneGit: vi.fn(async () => ({
        ok: true as const,
        value: {
          workspace: {
            workspaceId: 'cloned' as never,
            path: '/projects/repo',
            title: 'Assembled',
            sessionIds: [],
            createdAt: '0',
            updatedAt: '0',
          },
        },
      })),
    }))
    await expect(cloned.cloneWorkspace({ remoteUrl: 'https://github.com/o/repo.git', directoryName: 'repo' }))
      .resolves.toEqual({
        workspaceId: 'cloned',
        title: 'Assembled',
        normalizedRemoteUrl: 'https://github.com/o/repo',
      })
  })

  it('rejects Host Git failures without swallowing the message', async () => {
    const gateway = membershipGatewayOf(client(), workspaceGit({
      gitRemote: vi.fn(async () => ({
        ok: false as const,
        error: new RemoteError('gateway/internal', 'workspace Git timed out after 30000ms', {}),
      })),
    }))
    await expect(gateway.localRemoteFor('ws' as never)).rejects.toThrow('workspace Git timed out after 30000ms')
  })
})

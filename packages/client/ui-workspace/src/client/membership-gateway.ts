/** Adapt an optional membership client into the browsing-region gateway. */
import type { ProjectMembershipGateway } from './contract/slots.ts'

/** Desktop-provided membership client resolved without importing its package. */
export interface ProjectMembershipClientFace {
  roster(projectId: string): Promise<{
    project: { id: string; name: string; boundRemoteUrl: string }
    members: readonly {
      id: string
      accountId: string
      displayName: string
      avatarRef: string
      role: 'owner' | 'admin' | 'member'
      tags: readonly string[]
      presence: 'online' | 'offline'
    }[]
  }>
  invite(input: { projectId: string; githubLogin: string; grantedRole: 'admin' | 'member' }): Promise<{
    id: string
    inviteeName: string
    grantedRole: 'admin' | 'member'
  }>
  issuedInvitations(projectId: string): Promise<readonly {
    invitationId: string
    inviteeName: string
    grantedRole: 'admin' | 'member'
  }[]>
  retractInvitation(invitationId: string): Promise<void>
  decideInvitation(
    invitationId: string,
    input: { decision: 'decline' } | { decision: 'accept-with-link'; link: { workspaceName: string; normalizedRemoteUrl?: string } },
  ): Promise<void>
  changeRole(membershipId: string, role: 'owner' | 'admin' | 'member'): Promise<void>
  setMemberTags(membershipId: string, tags: readonly string[]): Promise<void>
  removeMember(membershipId: string): Promise<void>
  pendingInvitations(): Promise<readonly {
    invitationId: string
    receivingAccountId: string
    projectId: string
    projectName: string
    inviterName: string
    remoteUrl: string
    grantedRole: 'admin' | 'member'
  }[]>
}

/**
 * Adapt membership-client callbacks into the browsing-region gateway.
 * Workspace-keyed Git lookup, create-by-workspace, and clone remain Host gaps (#590).
 * @param client - Desktop-provided membership client.
 * @returns callback gateway for settings and the invite wizard.
 */
export function membershipGatewayOf(client: ProjectMembershipClientFace): ProjectMembershipGateway {
  const missingWorkspaceGit = (method: 'createProject' | 'projectForWorkspace' | 'localRemoteFor' | 'cloneWorkspace'): Promise<never> =>
    Promise.reject(new Error(`ui-workspace: ProjectMembershipGateway.${method} requires Host workspace Git (#590)`))
  return {
    createProject: () => missingWorkspaceGit('createProject'),
    projectForWorkspace: () => missingWorkspaceGit('projectForWorkspace'),
    roster: async (projectId) => {
      const read = await client.roster(projectId)
      return {
        project: { id: read.project.id, name: read.project.name, boundRemoteUrl: read.project.boundRemoteUrl },
        members: read.members.map(member => ({
          membershipId: member.id,
          accountId: member.accountId,
          displayName: member.displayName,
          avatarRef: member.avatarRef,
          role: member.role,
          tags: member.tags,
          presence: member.presence,
        })),
      }
    },
    invite: async (input) => {
      const issued = await client.invite(input)
      return { invitationId: issued.id, inviteeName: issued.inviteeName, grantedRole: issued.grantedRole }
    },
    issuedInvitations: projectId => client.issuedInvitations(projectId),
    retractInvitation: invitationId => client.retractInvitation(invitationId),
    decideInvitation: async (invitationId, decision) => {
      if (decision.decision === 'decline') {
        await client.decideInvitation(invitationId, { decision: 'decline' })
        return
      }
      await client.decideInvitation(invitationId, { decision: 'accept-with-link', link: decision.link })
    },
    changeRole: (membershipId, role) => client.changeRole(membershipId, role),
    setMemberTags: (membershipId, tags) => client.setMemberTags(membershipId, tags),
    removeMember: membershipId => client.removeMember(membershipId),
    pendingInvitations: () => client.pendingInvitations(),
    localRemoteFor: () => missingWorkspaceGit('localRemoteFor'),
    cloneWorkspace: () => missingWorkspaceGit('cloneWorkspace'),
  }
}

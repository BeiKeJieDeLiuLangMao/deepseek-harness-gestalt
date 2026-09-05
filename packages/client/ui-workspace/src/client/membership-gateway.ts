/**
 * Adapt Desktop's ProjectMembershipClient into browsing-region callbacks.
 * Workspace-keyed Git lookup, create-by-workspace, and clone remain Host gaps (#590).
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  FunctionTag, InvitationId, MembershipId, ProjectId, ProjectRole,
} from '@deepseek-ai/dsh-project-membership'
import type { ProjectMembershipClient } from '@deepseek-ai/dsh-project-membership-client'
import type { ProjectMembershipGateway, WorkspaceProjectRole } from './contract/slots.ts'

function projectIdOf(value: string): ProjectId {
  return brandString<ProjectId>(value)
}

function invitationIdOf(value: string): InvitationId {
  return brandString<InvitationId>(value)
}

function membershipIdOf(value: string): MembershipId {
  return brandString<MembershipId>(value)
}

function functionTagOf(value: string): FunctionTag {
  return brandString<FunctionTag>(value)
}

function grantableInviteRole(role: WorkspaceProjectRole): Exclude<ProjectRole, 'owner'> {
  if (role === 'owner') throw new Error('ui-workspace: invite cannot grant owner')
  return role
}

/**
 * Adapt membership-client callbacks into the browsing-region gateway.
 * @param client - Desktop-provided membership client.
 * @returns callback gateway for settings and the invite wizard.
 */
export function membershipGatewayOf(client: ProjectMembershipClient): ProjectMembershipGateway {
  const missingWorkspaceGit = (method: 'createProject' | 'projectForWorkspace' | 'localRemoteFor' | 'cloneWorkspace'): Promise<never> =>
    Promise.reject(new Error(`ui-workspace: ProjectMembershipGateway.${method} requires Host workspace Git (#590)`))
  return {
    createProject: () => missingWorkspaceGit('createProject'),
    projectForWorkspace: () => missingWorkspaceGit('projectForWorkspace'),
    roster: async (projectId) => {
      const read = await client.roster(projectIdOf(projectId))
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
      const grantedRole = grantableInviteRole(input.grantedRole)
      const issued = await client.invite({
        projectId: projectIdOf(input.projectId),
        githubLogin: input.githubLogin,
        grantedRole,
      })
      return {
        invitationId: issued.id,
        inviteeName: input.githubLogin,
        grantedRole: issued.grantedRole,
      }
    },
    issuedInvitations: async (projectId) => {
      const issued = await client.issuedInvitations(projectIdOf(projectId))
      return issued.map(row => ({
        invitationId: row.invitationId,
        inviteeName: row.inviteeName,
        grantedRole: row.grantedRole,
      }))
    },
    retractInvitation: invitationId => client.retractInvitation(invitationIdOf(invitationId)),
    decideInvitation: async (invitationId, decision) => {
      const id = invitationIdOf(invitationId)
      if (decision.decision === 'decline') {
        await client.decideInvitation(id, { decision: 'decline' })
        return
      }
      await client.decideInvitation(id, { decision: 'accept-with-link', link: decision.link })
    },
    changeRole: (membershipId, role) => client.changeRole(membershipIdOf(membershipId), role),
    setMemberTags: (membershipId, tags) => client.setMemberTags(
      membershipIdOf(membershipId),
      tags.map(functionTagOf),
    ),
    removeMember: membershipId => client.removeMember(membershipIdOf(membershipId)),
    pendingInvitations: async () => {
      const pending = await client.pendingInvitations()
      return pending.map(row => ({
        invitationId: row.invitationId,
        receivingAccountId: row.receivingAccountId,
        projectId: row.projectId,
        projectName: row.projectName,
        inviterName: row.inviterName,
        remoteUrl: row.remoteUrl,
        grantedRole: row.grantedRole,
      }))
    },
    localRemoteFor: () => missingWorkspaceGit('localRemoteFor'),
    cloneWorkspace: () => missingWorkspaceGit('cloneWorkspace'),
  }
}

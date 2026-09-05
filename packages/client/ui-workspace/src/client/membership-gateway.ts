/**
 * Adapt Desktop's ProjectMembershipClient into browsing-region callbacks.
 * Workspace-keyed Git lookup, create-by-workspace, and clone remain Host gaps (#590).
 * Call-time lookup keeps one injected gateway valid across late bind and replace.
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  FunctionTag, InvitationId, MembershipId, ProjectId, ProjectRole,
} from '@deepseek-ai/dsh-project-membership'
import type { ProjectMembershipClient } from '@deepseek-ai/dsh-project-membership-client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
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

/** Availability of the optional membership client, plus an epoch for provider replace. */
export type MembershipAvailabilitySnapshot = {
  available: boolean
  epoch: number
}

const UNAVAILABLE: MembershipAvailabilitySnapshot = Object.freeze({ available: false, epoch: 0 })

/**
 * Adapt membership-client callbacks into the browsing-region gateway.
 * @param clientOrRead - current client, or a lookup evaluated on each call.
 * @returns callback gateway for settings and the invite wizard.
 */
export function membershipGatewayOf(
  clientOrRead: ProjectMembershipClient | (() => ProjectMembershipClient | undefined),
): ProjectMembershipGateway {
  const readClient = typeof clientOrRead === 'function' ? clientOrRead : () => clientOrRead
  const missingWorkspaceGit = (method: 'createProject' | 'projectForWorkspace' | 'localRemoteFor' | 'cloneWorkspace'): Promise<never> =>
    Promise.reject(new Error(`ui-workspace: ProjectMembershipGateway.${method} requires Host workspace Git (#590)`))
  const requireClient = (): ProjectMembershipClient => {
    const client = readClient()
    if (client === undefined) {
      throw new Error('ui-workspace: ProjectMembershipGateway requires a membership client')
    }
    return client
  }
  return {
    createProject: () => missingWorkspaceGit('createProject'),
    projectForWorkspace: () => missingWorkspaceGit('projectForWorkspace'),
    roster: async (projectId) => {
      const read = await requireClient().roster(projectIdOf(projectId))
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
      const issued = await requireClient().invite({
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
      const issued = await requireClient().issuedInvitations(projectIdOf(projectId))
      return issued.map(row => ({
        invitationId: row.invitationId,
        inviteeName: row.inviteeName,
        grantedRole: row.grantedRole,
      }))
    },
    retractInvitation: invitationId => requireClient().retractInvitation(invitationIdOf(invitationId)),
    decideInvitation: async (invitationId, decision) => {
      const id = invitationIdOf(invitationId)
      if (decision.decision === 'decline') {
        await requireClient().decideInvitation(id, { decision: 'decline' })
        return
      }
      await requireClient().decideInvitation(id, { decision: 'accept-with-link', link: decision.link })
    },
    changeRole: (membershipId, role) => requireClient().changeRole(membershipIdOf(membershipId), role),
    setMemberTags: (membershipId, tags) => requireClient().setMemberTags(
      membershipIdOf(membershipId),
      tags.map(functionTagOf),
    ),
    removeMember: membershipId => requireClient().removeMember(membershipIdOf(membershipId)),
    pendingInvitations: async () => {
      const pending = await requireClient().pendingInvitations()
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

/**
 * Create one apply-owned availability source for the optional membership client.
 * @param readAvailable - whether Desktop currently provides the client.
 * @returns source plus the service-change notifier used from apply.
 */
export function createMembershipAvailabilitySource(
  readAvailable: () => boolean,
): {
  source: HostObservable<MembershipAvailabilitySnapshot>
  notifyProviderChange(): void
} {
  let snapshot: MembershipAvailabilitySnapshot = readAvailable()
    ? { available: true, epoch: 0 }
    : UNAVAILABLE
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // One subscriber must not starve the rest of the availability notify.
      }
    }
  }
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    notifyProviderChange(): void {
      snapshot = { available: readAvailable(), epoch: snapshot.epoch + 1 }
      notify()
    },
  }
}

/**
 * Adapt Desktop's ProjectMembershipClient into browsing-region callbacks.
 * Call-time lookup keeps one injected gateway valid across late bind and replace.
 * This adapter composes Host `gitRemote`, `cloneGit`, and directory pick.
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  FunctionTag, InvitationId, MembershipId, ProjectId, ProjectRole,
} from '@deepseek-ai/dsh-project-membership'
import {
  localWorkspaceRemoteUrl,
  normalizeGitRemoteUrl,
} from '@deepseek-ai/dsh-project-membership/remote-url'
import type {
  AuthenticatedProjectView,
  ProjectMembershipClient,
} from '@deepseek-ai/dsh-project-membership-client'
import type {
  WorkspaceCloneGitRequest,
  WorkspaceCloneGitValue,
  WorkspaceGitRemoteValue,
  WorkspaceId,
} from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ProjectMembershipGateway, WorkspaceProjectRole, WorkspaceProjectView } from './contract/slots.ts'

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

async function unwrapRemote<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const settled = await result
  if (!settled.ok) throw new Error(settled.error.message)
  return settled.value
}

function projectViewOf(project: AuthenticatedProjectView): WorkspaceProjectView {
  return {
    id: project.id,
    name: project.name,
    boundRemoteUrl: project.boundRemoteUrl,
    receivingAccountId: project.receivingAccountId,
  }
}

/** Availability of the optional membership client, plus an epoch for provider replace. */
export type MembershipAvailabilitySnapshot = {
  available: boolean
  epoch: number
}

/**
 * Injected Host Workspace Git and parent-directory pick. Apply closes these
 * over `ctx.remote`; the gateway never imports Context.
 */
export interface MembershipWorkspaceGit {
  /** Read the configured origin for one registered Workspace. */
  gitRemote(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<WorkspaceGitRemoteValue>>
  /** Clone a Git remote into a new child directory and register the Workspace. */
  cloneGit(request: WorkspaceCloneGitRequest, signal?: AbortSignal): Promise<RemoteResult<WorkspaceCloneGitValue>>
  /** Ask the operator for the clone parent directory; `null` is cancel. */
  pickParentDirectory(): Promise<RemoteResult<string | null>>
}

const UNAVAILABLE: MembershipAvailabilitySnapshot = Object.freeze({ available: false, epoch: 0 })

/**
 * Adapt membership-client callbacks into the browsing-region gateway.
 * @param clientOrRead - current client, or a lookup evaluated on each call.
 * @param workspaceGit - Host origin read, clone, and parent-directory pick.
 * @returns callback gateway for settings and the invite wizard.
 */
export function membershipGatewayOf(
  clientOrRead: ProjectMembershipClient | (() => ProjectMembershipClient | undefined),
  workspaceGit: MembershipWorkspaceGit,
): ProjectMembershipGateway {
  const readClient = typeof clientOrRead === 'function' ? clientOrRead : () => clientOrRead
  const requireClient = (): ProjectMembershipClient => {
    const client = readClient()
    if (client === undefined) {
      throw new Error('ui-workspace: ProjectMembershipGateway requires a membership client')
    }
    return client
  }
  const localRemoteFor = async (workspaceId: WorkspaceId): Promise<string | undefined> => {
    const value = await unwrapRemote(workspaceGit.gitRemote(workspaceId))
    return value.remoteUrl === undefined ? undefined : normalizeGitRemoteUrl(value.remoteUrl)
  }
  const remoteUrlFor = async (workspaceId: WorkspaceId): Promise<string> => {
    const remote = await localRemoteFor(workspaceId)
    return remote === undefined ? localWorkspaceRemoteUrl(workspaceId) : remote
  }
  return {
    createProject: async ({ name, localWorkspaceId }) => {
      const created = await requireClient().createProject({
        name,
        remoteUrl: await remoteUrlFor(localWorkspaceId),
      })
      return projectViewOf(created)
    },
    projectForWorkspace: async (workspaceId) => {
      const remote = await localRemoteFor(workspaceId)
      const lookup = remote === undefined
        ? localWorkspaceRemoteUrl(workspaceId)
        : normalizeGitRemoteUrl(remote)
      const project = await requireClient().projectByRemote(lookup)
      return project === undefined ? undefined : projectViewOf(project)
    },
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
    localRemoteFor,
    cloneWorkspace: async ({ remoteUrl, directoryName }) => {
      const parentPath = await unwrapRemote(workspaceGit.pickParentDirectory())
      if (parentPath === null) return undefined
      const cloned = await unwrapRemote(workspaceGit.cloneGit({ remoteUrl, parentPath, directoryName }))
      return {
        workspaceId: cloned.workspace.workspaceId,
        title: cloned.workspace.title,
        normalizedRemoteUrl: normalizeGitRemoteUrl(remoteUrl),
      }
    },
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

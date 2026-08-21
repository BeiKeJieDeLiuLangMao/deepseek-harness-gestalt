/** Desktop Companion authority backed by the Paired Desktop Web Host. */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  negotiateDevelopmentCompanionProtocol,
  openDevelopmentCompanionMessage,
  sealDevelopmentCompanionMessage,
  isDevelopmentKeylessSyncCiphertext,
} from '@deepseek-ai/dsh-remote-access-client'
import {
  parseCompanionSessionId,
  parseCompanionTranscriptEntryId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionConfirmedResult,
  type CompanionMessage,
  type CompanionOperation,
  type CompanionOperationId,
  type CompanionRejectedReason,
  type CompanionSessionCatalogRow,
  type CompanionSessionId,
  type CompanionTranscriptEntry,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  hostApprovalOutcome,
  hostSessionSummary,
  hostSessionTitle,
  matchHostSessions,
  projectHostApproval,
  projectHostHistory,
  projectHostQuestions,
  sanitizeIdentifier,
  type CompanionHostPendingInteraction,
} from './companion-host-transcript.ts'
import type { DesktopHostRpc, DesktopHostStreamFrame } from './host-rpc.ts'

const DEVELOPMENT_KEYLESS_SYNC_CIPHERTEXT = Uint8Array.of(1)
const CATALOG_DEBOUNCE_MS = 50

/** Hooks that deliver Host-backed Companion frames after a mutation or mux event. */
export interface HostCompanionAuthorityHooks {
  /** Deliver frames to the inbound source attachment. */
  readonly emit?: (frames: readonly Uint8Array[]) => void | Promise<void>
  /** Clock used to reject expired attachment capabilities. */
  readonly now?: () => number
  /** Schedule a delayed catalog refresh; the returned disposer cancels it. */
  readonly schedule?: (task: () => void, delayMs: number) => () => void
  /** Web Host cwd used to adopt a named Workspace directory. */
  readonly workspaceRoot?: () => string | undefined
}

/** Desktop authority that commits Companion operations through Host Session RPC. */
export class HostCompanionAuthority {
  private readonly protocol = negotiateDevelopmentCompanionProtocol()
  private readonly committed = new Map<string, CompanionConfirmedResult>()
  private readonly pending = new Map<string, CompanionHostPendingInteraction>()
  private readonly live = new Map<string, readonly CompanionTranscriptEntry[]>()
  private host: DesktopHostRpc | undefined
  private openSessionId: CompanionSessionId | undefined
  private workspaceRoot: string | undefined
  private readonly hostSessionIds = new Map<string, string>()
  private stopMux: (() => void) | undefined
  private stopHost: (() => void) | undefined
  private cancelCatalog: (() => void) | undefined
  private entryCount = 0

  /** @param hooks - delayed catalog emit and Relay delivery. */
  constructor(private readonly hooks: HostCompanionAuthorityHooks = {}) {}

  /**
   * Bind or replace the Web Host RPC face and subscribe to its streams.
   * @param rpc - loopback Host client for the current Web Host URL.
   * @param options - Web Host cwd used to adopt a named Workspace.
   */
  bindHost(rpc: DesktopHostRpc, options?: { cwd?: string }): void {
    this.stopMux?.()
    this.stopHost?.()
    this.host = rpc
    this.workspaceRoot = options?.cwd ?? this.hooks.workspaceRoot?.()
    this.stopMux = rpc.subscribeMux((frame) => { void this.onMux(frame) })
    this.stopHost = rpc.subscribeHost(() => { this.scheduleCatalog() })
    this.scheduleCatalog()
  }

  /**
   * Reply to one inbound development frame from the Host-backed Session store.
   * @param ciphertext - one-byte sync or a sealed Companion message.
   * @returns outbound frames for the source attachment; empty when the frame cannot be opened or Host is unbound.
   */
  async reply(ciphertext: Uint8Array): Promise<readonly Uint8Array[]> {
    if (isDevelopmentKeylessSyncCiphertext(ciphertext)) {
      return await this.sealAll([
        { type: 'sync' },
        ...await this.catalogMessages(),
      ])
    }
    let message: CompanionMessage
    try {
      message = await openDevelopmentCompanionMessage(this.protocol, ciphertext)
    } catch {
      // Unreviewed development frames that fail AES-GCM or Companion decode must not tear Relay.
      return []
    }
    if (message.type !== 'operation') return []
    return await this.sealAll(await this.handle(message.operation))
  }

  private async handle(operation: CompanionOperation): Promise<Array<CompanionMessage | { type: 'sync' }>> {
    switch (operation.type) {
      case 'create-session':
        return await this.createSession(operation)
      case 'open-session':
        return await this.openSession(operation)
      case 'submit-prompt':
        return await this.submitPrompt(operation)
      case 'cancel-prompt':
        return await this.cancelPrompt(operation)
      case 'search-sessions':
        return await this.searchSessions(operation)
      case 'query-operation-status': {
        const committed = this.committed.get(operation.operationId)
        return [{
          type: 'result',
          result: committed === undefined
            ? { type: 'status', operationId: operation.operationId, absent: true }
            : { type: 'status', operationId: operation.operationId, committed },
        }]
      }
      case 'offer-attachment':
        return await this.offerAttachment(operation)
      case 'settle-approval':
        return await this.settleApproval(operation)
      case 'answer-ask-user':
        return await this.answerAskUser(operation)
      default: {
        const never: never = operation
        return never
      }
    }
  }

  private async createSession(
    operation: Extract<CompanionOperation, { type: 'create-session' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) return [{ type: 'result', result: existing }]
    const host = this.requireHost()
    if (host === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    const workspaceId = operation.workspace === undefined
      ? undefined
      : await this.ensureWorkspace(host, operation.workspace)
    const created = await host.call('session.create', {
      sessionId: this.hostId(operation.sessionId),
      ...(workspaceId === undefined ? {} : { workspaceId }),
    })
    if (!created.ok) return [this.reject(operation.operationId, 'host-rejected')]
    const sessionId = isRecord(created.value) && typeof created.value.sessionId === 'string'
      ? created.value.sessionId
      : this.hostId(operation.sessionId)
    this.rememberHostSession(sessionId)
    await host.call('session.rename', { sessionId, title: operation.title })
    this.openSessionId = this.rememberHostSession(sessionId)
    return [this.confirm(operation.operationId), ...await this.catalogMessages()]
  }

  private async openSession(
    operation: Extract<CompanionOperation, { type: 'open-session' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) {
      return [{ type: 'result', result: existing }, ...await this.transcriptMessages(operation.sessionId)]
    }
    if (this.requireHost() === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    this.openSessionId = operation.sessionId
    return [this.confirm(operation.operationId), ...await this.transcriptMessages(operation.sessionId)]
  }

  private async submitPrompt(
    operation: Extract<CompanionOperation, { type: 'submit-prompt' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) {
      return [{ type: 'result', result: existing }, ...await this.transcriptMessages(operation.sessionId)]
    }
    const host = this.requireHost()
    if (host === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    const prompted = await host.call('session.prompt', {
      sessionId: this.hostId(operation.sessionId),
      mode: 'queue',
      content: [{ type: 'text', text: operation.text }],
    })
    if (!prompted.ok) return [this.reject(operation.operationId, 'host-rejected')]
    this.openSessionId = operation.sessionId
    return [this.confirm(operation.operationId), ...await this.transcriptMessages(operation.sessionId, true)]
  }

  private async cancelPrompt(
    operation: Extract<CompanionOperation, { type: 'cancel-prompt' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) {
      return [{ type: 'result', result: existing }, ...await this.transcriptMessages(operation.sessionId)]
    }
    const host = this.requireHost()
    if (host === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    const cancelled = await host.call('session.cancel', { sessionId: this.hostId(operation.sessionId) })
    if (!cancelled.ok) return [this.reject(operation.operationId, 'host-rejected')]
    return [this.confirm(operation.operationId), ...await this.transcriptMessages(operation.sessionId)]
  }

  private async offerAttachment(
    operation: Extract<CompanionOperation, { type: 'offer-attachment' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) return [{ type: 'result', result: existing }]
    if (operation.expiresAt <= (this.hooks.now?.() ?? Date.now())) {
      return [{
        type: 'result',
        result: { type: 'attachment-rejected', operationId: operation.operationId, reason: 'expired' },
      }]
    }
    const host = this.requireHost()
    if (host === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    const prompted = await host.call('session.prompt', {
      sessionId: this.hostId(operation.sessionId),
      mode: 'queue',
      content: [{ type: 'text', text: `Attached: ${operation.fileName}` }],
    })
    if (!prompted.ok) return [this.reject(operation.operationId, 'host-rejected')]
    this.openSessionId = operation.sessionId
    return [this.confirm(operation.operationId), ...await this.transcriptMessages(operation.sessionId, true)]
  }

  private async settleApproval(
    operation: Extract<CompanionOperation, { type: 'settle-approval' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) {
      return [{ type: 'result', result: existing }, ...await this.transcriptMessages(operation.sessionId)]
    }
    const host = this.requireHost()
    const pending = this.pending.get(operation.interactionId)
    const outcome = hostApprovalOutcome(operation.decision)
    if (host === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    if (pending === undefined || pending.kind !== 'approval' || outcome === undefined) {
      return [this.reject(operation.operationId, 'host-rejected')]
    }
    const receipt = await host.respond(pending.rpcId, {
      sessionId: pending.sessionId,
      approvalId: pending.hostId,
      outcome,
    })
    if (!receipt.accepted) return [this.reject(operation.operationId, 'host-rejected')]
    return [this.confirm(operation.operationId), ...await this.transcriptMessages(operation.sessionId)]
  }

  private async answerAskUser(
    operation: Extract<CompanionOperation, { type: 'answer-ask-user' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) {
      return [{ type: 'result', result: existing }, ...await this.transcriptMessages(operation.sessionId)]
    }
    const host = this.requireHost()
    const pending = this.pending.get(operation.interactionId)
    if (host === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    if (pending === undefined || pending.kind !== 'ask-user') return [this.reject(operation.operationId, 'host-rejected')]
    const receipt = await host.respond(pending.rpcId, {
      sessionId: pending.sessionId,
      answer: {
        answers: [{
          id: pending.questionId ?? pending.hostId,
          selected: [operation.decision],
        }],
      },
    })
    if (!receipt.accepted) return [this.reject(operation.operationId, 'host-rejected')]
    return [this.confirm(operation.operationId), ...await this.transcriptMessages(operation.sessionId)]
  }

  private async onMux(frame: DesktopHostStreamFrame): Promise<void> {
    const type = frame.payload.type
    const sessionId = typeof frame.payload.sessionId === 'string' ? frame.payload.sessionId : undefined
    if (type === 'approval/requested' && sessionId !== undefined && typeof frame.payload.approvalId === 'string') {
      const interactionId = sanitizeIdentifier(frame.payload.approvalId)
      this.pending.set(interactionId, {
        kind: 'approval',
        sessionId,
        rpcId: frame.rpcId,
        hostId: frame.payload.approvalId,
      })
      const card = projectHostApproval({
        approvalId: frame.payload.approvalId,
        toolName: typeof frame.payload.toolName === 'string' ? frame.payload.toolName : 'tool',
        ...(typeof frame.payload.reason === 'string' ? { reason: frame.payload.reason } : {}),
        ...(typeof frame.payload.cwd === 'string' ? { cwd: frame.payload.cwd } : {}),
        ...(typeof frame.payload.diff === 'string' ? { diff: frame.payload.diff } : {}),
        ...(typeof frame.payload.terminal === 'string' ? { terminal: frame.payload.terminal } : {}),
      })
      const prior = this.live.get(sessionId) ?? []
      this.live.set(sessionId, [...prior.filter(entry => entry.type !== 'approval' || entry.interactionId !== card.interactionId), card])
    }
    if (type === 'question/requested' && sessionId !== undefined && Array.isArray(frame.payload.questions)) {
      for (const card of projectHostQuestions(frame.payload.questions)) {
        const question = frame.payload.questions.find(item => (
          isRecord(item) && sanitizeIdentifier(String(item.id)) === card.interactionId
        ))
        this.pending.set(card.interactionId, {
          kind: 'ask-user',
          sessionId,
          rpcId: frame.rpcId,
          hostId: card.interactionId,
          ...(isRecord(question) && typeof question.id === 'string' ? { questionId: question.id } : {}),
        })
        const prior = this.live.get(sessionId) ?? []
        this.live.set(sessionId, [...prior.filter(entry => entry.type !== 'ask-user' || entry.interactionId !== card.interactionId), card])
      }
    }
    if (type === 'approval/resolved' && typeof frame.payload.approvalId === 'string') {
      this.pending.delete(sanitizeIdentifier(frame.payload.approvalId))
    }
    if (type === 'question/resolved') this.scheduleCatalog()
    if (sessionId !== undefined && (this.openSessionId === sessionId || this.hostId(this.openSessionId ?? '') === sessionId
      || type === 'approval/requested' || type === 'question/requested')) {
      await this.emitMessages(await this.transcriptMessages(this.rememberHostSession(sessionId), type === 'session/event'))
    }
    this.scheduleCatalog()
  }

  private scheduleCatalog(): void {
    this.cancelCatalog?.()
    const schedule = this.hooks.schedule ?? defaultSchedule
    this.cancelCatalog = schedule(() => {
      this.cancelCatalog = undefined
      void this.emitMessages(this.catalogMessages())
    }, CATALOG_DEBOUNCE_MS)
  }

  private async catalogMessages(): Promise<CompanionMessage[]> {
    const host = this.host
    if (host === undefined) return []
    const [sessions, workspaces] = await Promise.all([
      host.call('session.list', {}),
      host.call('workspace.list', {}),
    ])
    if (!sessions.ok || !workspaces.ok) return []
    const workspaceBySession = workspaceTitles(workspaces.value)
    const items = sortHostSessions(listItems(sessions.value).filter(item => item.origin !== 'subagent'))
      .slice(0, REMOTE_PROTOCOL_LIMITS.sessionCatalogEntries)
    const rows: CompanionSessionCatalogRow[] = []
    for (const item of items) {
      try {
        rows.push({
          sessionId: this.rememberHostSession(item.sessionId),
          title: hostSessionTitle(item),
          summary: hostSessionSummary(item),
          ...(workspaceBySession.get(item.sessionId) === undefined
            ? {}
            : { workspace: workspaceBySession.get(item.sessionId) }),
          ...(item.running === true ? { live: true } : {}),
        })
      } catch {
        // Host ids that cannot become Companion identifiers stay off the catalog rather than failing sync.
      }
    }
    return [{ type: 'projection', projection: { type: 'session-catalog', sessions: rows } }]
  }

  private async transcriptMessages(
    sessionId: CompanionSessionId,
    streaming = false,
  ): Promise<CompanionMessage[]> {
    const host = this.host
    const live = this.live.get(sessionId) ?? []
    if (host === undefined) {
      return [{
        type: 'projection',
        projection: {
          type: 'transcript-page',
          sessionId,
          entries: live,
          ...(streaming ? { streaming: true } : {}),
        },
      }]
    }
    const history = await host.call('session.history', {
      sessionId: this.hostId(sessionId),
      maxMessages: REMOTE_PROTOCOL_LIMITS.transcriptPageEntries,
    })
    const events = history.ok ? historyEvents(history.value) : []
    const pending = live.filter(entry => entry.type === 'approval' || entry.type === 'ask-user')
    const entries = [...projectHostHistory(events), ...pending]
      .slice(-REMOTE_PROTOCOL_LIMITS.transcriptPageEntries)
    this.live.set(sessionId, entries)
    return [{
      type: 'projection',
      projection: {
        type: 'transcript-page',
        sessionId,
        entries,
        ...(streaming ? { streaming: true } : {}),
      },
    }]
  }

  private async searchSessions(
    operation: Extract<CompanionOperation, { type: 'search-sessions' }>,
  ): Promise<CompanionMessage[]> {
    const existing = this.committed.get(operation.operationId)
    if (existing !== undefined) {
      return [{ type: 'result', result: existing }, ...await this.searchMessages(operation.query)]
    }
    if (this.requireHost() === undefined) return [this.reject(operation.operationId, 'host-unavailable')]
    return [this.confirm(operation.operationId), ...await this.searchMessages(operation.query)]
  }

  private async searchMessages(query: string): Promise<CompanionMessage[]> {
    const host = this.host
    if (host === undefined) return []
    const [sessions, workspaces, content] = await Promise.all([
      host.call('session.list', {}),
      host.call('workspace.list', {}),
      host.call('session.search', { query: query.trim() }),
    ])
    if (!sessions.ok || !workspaces.ok) return []
    const workspaceBySession = workspaceTitles(workspaces.value)
    const rows = listItems(sessions.value)
      .filter(item => item.origin !== 'subagent')
      .map(item => ({
        sessionId: item.sessionId,
        title: hostSessionTitle(item),
        summary: hostSessionSummary(item),
        ...(workspaceBySession.get(item.sessionId) === undefined
          ? {}
          : { workspace: workspaceBySession.get(item.sessionId) }),
        ...(item.running === true ? { live: true } : {}),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
      }))
    const snippets = new Map<string, string>()
    if (content.ok && isRecord(content.value) && Array.isArray(content.value.items)) {
      for (const item of content.value.items) {
        if (isRecord(item) && typeof item.sessionId === 'string'
          && typeof item.snippet === 'string' && item.snippet.length > 0) {
          snippets.set(item.sessionId, item.snippet)
        }
      }
    }
    const hits = matchHostSessions(rows, query, snippets, REMOTE_PROTOCOL_LIMITS.sessionSearchEntries)
    return [{
      type: 'projection',
      projection: {
        type: 'session-search',
        query,
        sessions: hits.flatMap((hit) => {
          try {
            return [{
              sessionId: this.rememberHostSession(hit.sessionId),
              title: hit.title,
              summary: hit.snippet ?? hit.summary,
              ...(hit.workspace === undefined ? {} : { workspace: hit.workspace }),
              ...(hit.live === true ? { live: true } : {}),
              ...(hit.snippet === undefined ? {} : { snippet: hit.snippet }),
            }]
          } catch {
            return []
          }
        }),
      },
    }]
  }

  private async ensureWorkspace(host: DesktopHostRpc, title: string): Promise<string | undefined> {
    const existing = await this.workspaceIdForTitle(host, title)
    if (existing !== undefined) return existing
    const root = this.workspaceRoot
    if (root === undefined) return undefined
    const directory = join(root, 'companion-workspaces', workspaceDirectoryName(title))
    await mkdir(directory, { recursive: true })
    const created = await host.call('workspace.create', { path: directory })
    if (!created.ok || !isRecord(created.value) || !isRecord(created.value.workspace)) return undefined
    const workspaceId = created.value.workspace.workspaceId
    if (typeof workspaceId !== 'string') return undefined
    if (created.value.workspace.title !== title) {
      await host.call('workspace.rename', { workspaceId, title })
    }
    return workspaceId
  }

  private async workspaceIdForTitle(host: DesktopHostRpc, title: string): Promise<string | undefined> {
    const listed = await host.call('workspace.list', {})
    if (!listed.ok) return undefined
    const workspaces = isRecord(listed.value) && Array.isArray(listed.value.items) ? listed.value.items : []
    const match = workspaces.find(item => isRecord(item) && item.title === title && typeof item.workspaceId === 'string')
    return match === undefined || !isRecord(match) || typeof match.workspaceId !== 'string'
      ? undefined
      : match.workspaceId
  }

  private async emitMessages(messages: Promise<Array<CompanionMessage | { type: 'sync' }>> | Array<CompanionMessage | { type: 'sync' }>): Promise<void> {
    const frames = await this.sealAll(await messages)
    if (frames.length === 0) return
    await this.hooks.emit?.(frames)
  }

  private async sealAll(messages: ReadonlyArray<CompanionMessage | { type: 'sync' }>): Promise<Uint8Array[]> {
    const frames: Uint8Array[] = []
    for (const message of messages) {
      if (message.type === 'sync') {
        frames.push(DEVELOPMENT_KEYLESS_SYNC_CIPHERTEXT)
        continue
      }
      frames.push(await sealDevelopmentCompanionMessage(this.protocol, message))
    }
    return frames
  }

  private reject(operationId: CompanionOperationId, reason: CompanionRejectedReason): CompanionMessage {
    return { type: 'result', result: { type: 'rejected', operationId, reason } }
  }

  private rememberHostSession(hostId: string): CompanionSessionId {
    const companionId = parseCompanionSessionId(sanitizeIdentifier(hostId))
    this.hostSessionIds.set(companionId, hostId)
    return companionId
  }

  private hostId(sessionId: string): string {
    return this.hostSessionIds.get(sessionId) ?? sessionId
  }

  private confirm(operationId: CompanionOperationId): CompanionMessage {
    const existing = this.committed.get(operationId)
    if (existing !== undefined) return { type: 'result', result: existing }
    const result: CompanionConfirmedResult = {
      type: 'confirmed',
      operationId,
      committedAt: Date.now(),
      outcome: 'accepted',
    }
    this.committed.set(operationId, result)
    return { type: 'result', result }
  }

  private requireHost(): DesktopHostRpc | undefined {
    return this.host
  }

  private nextEntryId(): ReturnType<typeof parseCompanionTranscriptEntryId> {
    this.entryCount += 1
    return parseCompanionTranscriptEntryId(`entry-${String(this.entryCount)}`)
  }
}

function workspaceDirectoryName(title: string): string {
  const compact = title.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return compact.length === 0 ? 'workspace' : compact.slice(0, 80)
}

function sortHostSessions<T extends { updatedAt?: unknown }>(items: readonly T[]): T[] {
  return items.slice().sort((left, right) => hostUpdatedAt(right) - hostUpdatedAt(left))
}

function hostUpdatedAt(item: { updatedAt?: unknown }): number {
  return typeof item.updatedAt === 'number' ? item.updatedAt : 0
}

function listItems(value: unknown): Array<Record<string, unknown> & { sessionId: string; running?: boolean; origin?: string }> {
  if (!isRecord(value) || !Array.isArray(value.items)) return []
  return value.items.flatMap(item => (
    isRecord(item) && typeof item.sessionId === 'string'
      ? [{ ...item, sessionId: item.sessionId }]
      : []
  ))
}

function historyEvents(value: unknown): unknown[] {
  return isRecord(value) && Array.isArray(value.events) ? value.events : []
}

function workspaceTitles(value: unknown): Map<string, string> {
  const titles = new Map<string, string>()
  if (!isRecord(value) || !Array.isArray(value.items)) return titles
  const archived = new Set(
    Array.isArray(value.archivedSessionIds)
      ? value.archivedSessionIds.filter((id): id is string => typeof id === 'string')
      : [],
  )
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.title !== 'string' || !Array.isArray(item.sessionIds)) continue
    for (const sessionId of item.sessionIds) {
      if (typeof sessionId === 'string' && !archived.has(sessionId)) titles.set(sessionId, item.title)
    }
  }
  return titles
}

function defaultSchedule(task: () => void, delayMs: number): () => void {
  const timer = setTimeout(task, delayMs)
  return () => { clearTimeout(timer) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

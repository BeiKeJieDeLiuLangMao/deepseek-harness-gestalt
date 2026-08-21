/** Project Host Session history into Companion transcript entries. */

import {
  parseCompanionInteractionId,
  parseCompanionTranscriptEntryId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionTranscriptEntry,
} from '@deepseek-ai/dsh-remote-protocol'

const IMAGE_FILE_NAME = /\.(avif|gif|heic|jpe?g|png|webp)$/iu

/** Pending Host interaction that Mobile may settle through `/api/respond`. */
export interface CompanionHostPendingInteraction {
  kind: 'approval' | 'ask-user'
  sessionId: string
  rpcId: string
  hostId: string
  questionId?: string
}

/**
 * Fold one Host history page into Companion transcript entries.
 * @param events - `session.history` `events` array, each `{ event }` or a raw event.
 * @returns bounded Desktop-approved transcript entries.
 */
export function projectHostHistory(
  events: readonly unknown[],
): readonly CompanionTranscriptEntry[] {
  const entries: CompanionTranscriptEntry[] = []
  let count = 0
  const nextId = (): ReturnType<typeof parseCompanionTranscriptEntryId> => {
    count += 1
    return parseCompanionTranscriptEntryId(`entry-${String(count)}`)
  }
  let pendingChunk = ''
  const flushChunk = (): void => {
    if (pendingChunk.length === 0) return
    entries.push({ type: 'text', entryId: nextId(), role: 'assistant', text: pendingChunk })
    pendingChunk = ''
  }
  for (const item of events) {
    const event = unwrapHistoryEvent(item)
    if (event === undefined) continue
    switch (event.type) {
      case 'user/message':
        flushChunk()
        pushUserMessage(entries, nextId, messageFrom(event.data))
        break
      case 'agent/inbox/spliced':
        flushChunk()
        for (const message of insertedUserMessages(event.data)) {
          pushUserMessage(entries, nextId, message)
        }
        break
      case 'assistant/message':
        pendingChunk = ''
        for (const text of textBlocks(messageFrom(event.data))) {
          entries.push({ type: 'text', entryId: nextId(), role: 'assistant', text })
        }
        break
      case 'assistant/chunk': {
        const text = chunkText(event.data)
        if (text !== undefined) pendingChunk += text
        break
      }
      case 'tool/call': {
        flushChunk()
        const name = toolName(event.data)
        if (name !== undefined) {
          entries.push({ type: 'text', entryId: nextId(), role: 'assistant', text: `Tool: ${name}` })
        }
        break
      }
      default:
        break
    }
  }
  flushChunk()
  return entries.slice(-REMOTE_PROTOCOL_LIMITS.transcriptPageEntries)
}

/**
 * Project one live Host approval onto a Companion card.
 * @param input - Host approval id, tool name, and optional reason.
 * @returns Companion approval entry using Mobile-settled decision tokens.
 */
export function projectHostApproval(input: {
  approvalId: string
  toolName: string
  reason?: string
  cwd?: string
  diff?: string
  terminal?: string
}): Extract<CompanionTranscriptEntry, { type: 'approval' }> {
  return {
    type: 'approval',
    entryId: parseCompanionTranscriptEntryId(`approval-${sanitizeIdentifier(input.approvalId)}`),
    interactionId: parseCompanionInteractionId(sanitizeIdentifier(input.approvalId)),
    summary: input.reason ?? input.toolName,
    authorized: ['once', 'always', 'rejected'],
    ...(input.cwd === undefined || input.cwd.length === 0 ? {} : { cwd: input.cwd }),
    ...(input.diff === undefined || input.diff.length === 0 ? {} : { diff: input.diff }),
    ...(input.terminal === undefined || input.terminal.length === 0 ? {} : { terminal: input.terminal }),
  }
}

/**
 * Project one live Host Ask User batch onto Companion cards.
 * @param questions - Host `question/requested` items.
 * @returns one card per question that has a protocol-safe interaction id.
 */
export function projectHostQuestions(
  questions: readonly unknown[],
): readonly Extract<CompanionTranscriptEntry, { type: 'ask-user' }>[] {
  return questions.flatMap((question) => {
    if (!isRecord(question) || typeof question.id !== 'string' || typeof question.question !== 'string') {
      return []
    }
    const authorized = optionLabels(question.options)
    return [{
      type: 'ask-user' as const,
      entryId: parseCompanionTranscriptEntryId(`question-${sanitizeIdentifier(question.id)}`),
      interactionId: parseCompanionInteractionId(sanitizeIdentifier(question.id)),
      summary: question.question,
      authorized: authorized.length > 0 ? authorized : ['ok'],
    }]
  })
}

/**
 * Read a Host `session.list` title without importing Host projection types.
 * @param item - one list row.
 * @returns Desktop title, or `Session` when the Host has not published one.
 */
export function hostSessionTitle(item: Record<string, unknown>): string {
  const projections = isRecord(item.projections) ? item.projections : undefined
  const values = projections !== undefined && isRecord(projections.values) ? projections.values : undefined
  return typeof values?.title === 'string' && values.title.length > 0 ? values.title : 'Session'
}

/**
 * Read a Host `session.list` summary without importing Host projection types.
 * @param item - one list row.
 * @returns Desktop preview text, or the title when the Host has not published a preview.
 */
export function hostSessionSummary(item: Record<string, unknown>): string {
  const projections = isRecord(item.projections) ? item.projections : undefined
  const values = projections !== undefined && isRecord(projections.values) ? projections.values : undefined
  if (typeof values?.preview === 'string' && values.preview.length > 0) return values.preview
  return hostSessionTitle(item)
}

/** One Host Session row already flattened for Companion search. */
export interface HostSearchableSession {
  sessionId: string
  title: string
  summary: string
  workspace?: string
  live?: boolean
  updatedAt: number
  snippet?: string
}

/**
 * Rank title, workspace, summary, and Host content-search hits the way Desktop sidebar does.
 * @param rows - visible Host Session rows.
 * @param query - Mobile search text.
 * @param snippets - optional `session.search` hits keyed by Host Session id.
 * @param limit - maximum returned rows.
 * @returns recency-ordered matches, with content snippets when the Host supplied them.
 */
export function matchHostSessions(
  rows: readonly HostSearchableSession[],
  query: string,
  snippets: ReadonlyMap<string, string>,
  limit: number,
): readonly HostSearchableSession[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const local = rows
    .filter(row => (
      row.title.toLowerCase().includes(needle)
      || row.summary.toLowerCase().includes(needle)
      || (row.workspace?.toLowerCase().includes(needle) ?? false)
    ))
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const ordered: HostSearchableSession[] = []
  const seen = new Set<string>()
  const include = (row: HostSearchableSession): void => {
    if (seen.has(row.sessionId)) return
    seen.add(row.sessionId)
    const snippet = snippets.get(row.sessionId)
    ordered.push(snippet === undefined ? row : { ...row, snippet })
  }
  for (const row of local) include(row)
  for (const [sessionId, snippet] of snippets) {
    const row = rows.find(item => item.sessionId === sessionId)
    if (row !== undefined) include({ ...row, snippet })
  }
  return ordered.slice(0, limit)
}

/**
 * Map a Mobile settlement token onto the Host approval outcome.
 * @param decision - Companion authorized decision.
 * @returns Host-answerable outcome, or `undefined` when the token is not an approval outcome.
 */
export function hostApprovalOutcome(decision: string): 'allowed-once' | 'rejected' | undefined {
  if (decision === 'once' || decision === 'always' || decision === 'allowed-once' || decision === '允许' || decision === '始终允许') {
    return 'allowed-once'
  }
  if (decision === 'rejected' || decision === '取消' || decision === 'cancel') return 'rejected'
  return undefined
}

/**
 * Keep only Companion identifier characters so Host ids can ride the wire.
 * @param value - Host approval, question, or Session id.
 * @returns branded-safe identifier.
 */
export function sanitizeIdentifier(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9_-]/gu, '-')
  if (compact.length === 0) return 'id'
  return compact.length > 128 ? compact.slice(0, 128) : compact
}

function pushUserMessage(
  entries: CompanionTranscriptEntry[],
  nextId: () => ReturnType<typeof parseCompanionTranscriptEntryId>,
  message: unknown,
): void {
  for (const text of textBlocks(message)) {
    entries.push({ type: 'text', entryId: nextId(), role: 'user', text })
  }
  for (const fileName of imageBlocks(message)) {
    if (IMAGE_FILE_NAME.test(fileName)) {
      entries.push({ type: 'image', entryId: nextId(), fileName, alt: fileName })
      continue
    }
    entries.push({ type: 'text', entryId: nextId(), role: 'user', text: `Attached: ${fileName}` })
  }
}

function insertedUserMessages(data: unknown): readonly unknown[] {
  if (!isRecord(data) || !Array.isArray(data.inserted)) return []
  return data.inserted.filter((message) => {
    if (!isRecord(message)) return false
    const source = isRecord(message.source) ? message.source : undefined
    return source?.kind === 'user'
  })
}

function chunkText(data: unknown): string | undefined {
  if (typeof data === 'string' && data.length > 0) return data
  if (!isRecord(data)) return undefined
  if (typeof data.text === 'string' && data.text.length > 0) return data.text
  if (typeof data.delta === 'string' && data.delta.length > 0) return data.delta
  return undefined
}

function unwrapHistoryEvent(item: unknown): { type: string; data?: unknown } | undefined {
  const record = isRecord(item) ? item : undefined
  if (record === undefined) return undefined
  const event = isRecord(record.event) ? record.event : record
  return typeof event.type === 'string' ? { type: event.type, data: event.data } : undefined
}

function messageFrom(data: unknown): unknown {
  if (!isRecord(data)) return undefined
  return isRecord(data.message) ? data.message : data
}

function textBlocks(message: unknown): readonly string[] {
  if (!isRecord(message) || !Array.isArray(message.content)) return []
  return message.content.flatMap(part => (
    isRecord(part) && part.type === 'text' && typeof part.text === 'string' && part.text.length > 0
      ? [part.text]
      : []
  ))
}

function imageBlocks(message: unknown): readonly string[] {
  if (!isRecord(message) || !Array.isArray(message.content)) return []
  return message.content.flatMap((part) => {
    if (!isRecord(part) || part.type !== 'image') return []
    const attachment = isRecord(part.attachment) ? part.attachment : undefined
    const name = typeof attachment?.name === 'string' && attachment.name.length > 0
      ? attachment.name
      : typeof part.name === 'string' && part.name.length > 0 ? part.name : 'image'
    return [name]
  })
}

function toolName(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined
  if (typeof data.name === 'string' && data.name.length > 0) return data.name
  const call = isRecord(data.call) ? data.call : undefined
  return typeof call?.name === 'string' && call.name.length > 0 ? call.name : undefined
}

function optionLabels(options: unknown): readonly string[] {
  if (!Array.isArray(options)) return []
  return options.flatMap(option => (
    isRecord(option) && typeof option.label === 'string' && option.label.length > 0 ? [option.label] : []
  ))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

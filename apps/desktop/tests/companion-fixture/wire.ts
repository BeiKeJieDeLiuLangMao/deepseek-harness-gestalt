import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment/types'
import type { SessionEvent, SessionEventMap, SessionId } from '@deepseek-ai/dsh-session/types'

/** Suite-local control messages; product traffic uses the real Host HTTP/WebSocket API. */
export type FixtureCommand =
  | { type: 'start'; scenario: 'indexed' | 'disabled' | 'index-failure'; message: string; enableCreation: boolean }
  | { type: 'create-session'; id: SessionId; createdAt: number; cwd: string }
  | { type: 'append'; id: SessionId; event: 'turn/start'; data: SessionEventMap['turn/start'] }
  | { type: 'append'; id: SessionId; event: 'step/start'; data: SessionEventMap['step/start'] }
  | { type: 'append'; id: SessionId; event: 'assistant/chunk'; data: SessionEventMap['assistant/chunk'] }
  | { type: 'message'; id: SessionId; text: string }
  | { type: 'finish-cancelled-response'; id: SessionId; turn: number; step: number; text: string }
  | { type: 'events'; id: SessionId }
  | { type: 'cancelled' }
  | { type: 'workspace-create'; root: string; name: string }
  | { type: 'workspace-attach'; workspaceId: WorkspaceId; sessionId: SessionId }
  | { type: 'workspace-reorder' | 'workspace-delete'; workspaceId: WorkspaceId }
  | { type: 'archive'; sessionId: SessionId }
  | { type: 'question' | 'approval' }
  | { type: 'settlement'; token: 'question' | 'approval' }
  | { type: 'codec' }
  | { type: 'dispose' }

/** Data returned by the fixture, never Host service objects or Client ambient types. */
interface FixtureReady {
  url: string
  root: string
  sessionId: SessionId
  image: ImageAttachmentRef
}

export interface FixtureResults {
  start: FixtureReady
  'create-session': undefined
  append: undefined
  message: undefined
  'finish-cancelled-response': undefined
  events: SessionEvent[]
  cancelled: number
  'workspace-create': { id: WorkspaceId }
  'workspace-attach': undefined
  'workspace-reorder': undefined
  'workspace-delete': undefined
  archive: undefined
  question: 'question'
  approval: 'approval'
  settlement: AskUserQuestionAnswer | ApprovalOutcome
  codec: Uint8Array
  dispose: undefined
}

export interface FixtureRequest { id: number; command: FixtureCommand }
export type FixtureResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string }

/** Validate the IPC response envelope before correlating it with a pending command. */
export function isFixtureResponse(value: unknown): value is FixtureResponse {
  if (!record(value) || !positiveId(value.id)) return false
  return value.ok === true ? 'value' in value : value.ok === false && typeof value.error === 'string'
}

/** Validate the closed set of suite-local IPC commands, including their required fields. */
export function isFixtureRequest(value: unknown): value is FixtureRequest {
  if (!record(value) || !positiveId(value.id) || !record(value.command)) return false
  const c = value.command
  switch (c.type) {
    case 'start': return ['indexed', 'disabled', 'index-failure'].includes(String(c.scenario))
      && typeof c.message === 'string' && typeof c.enableCreation === 'boolean'
    case 'create-session': return typeof c.id === 'string' && typeof c.cwd === 'string'
      && typeof c.createdAt === 'number' && Number.isFinite(c.createdAt)
    case 'append': return typeof c.id === 'string' && record(c.data)
      && typeof c.data.turn === 'number' && Number.isSafeInteger(c.data.turn)
      && (c.event === 'turn/start' || (typeof c.data.step === 'number' && Number.isSafeInteger(c.data.step)
        && (c.event === 'step/start' || (c.event === 'assistant/chunk' && record(c.data.chunk)
          && c.data.chunk.index === 0 && ((c.data.chunk.type === 'block-start' && c.data.chunk.blockType === 'text')
            || (c.data.chunk.type === 'text-delta' && typeof c.data.chunk.text === 'string'))))))
    case 'finish-cancelled-response': return typeof c.id === 'string'
      && typeof c.turn === 'number' && Number.isSafeInteger(c.turn) && c.turn > 0
      && typeof c.step === 'number' && Number.isSafeInteger(c.step) && c.step > 0
      && typeof c.text === 'string' && c.text.trim() !== ''
    case 'message': return typeof c.id === 'string' && typeof c.text === 'string'
    case 'events': return typeof c.id === 'string'
    case 'workspace-create': return typeof c.root === 'string' && typeof c.name === 'string'
    case 'workspace-attach': return typeof c.workspaceId === 'string' && typeof c.sessionId === 'string'
    case 'workspace-reorder': case 'workspace-delete': return typeof c.workspaceId === 'string'
    case 'archive': return typeof c.sessionId === 'string'
    case 'settlement': return c.token === 'question' || c.token === 'approval'
    case 'cancelled': case 'question': case 'approval': case 'codec': case 'dispose': return true
    default: return false
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

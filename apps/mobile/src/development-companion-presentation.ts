/** Keyless development composition for exercising the bundled Mobile product entry. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  EMPTY_CHAT_SNAPSHOT,
  EMPTY_CONVERSATION_VIEWS,
  type ConversationSnapshot,
  type SessionId,
  type ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { MobileCompanionPresentation } from './companion-history.ts'

const SESSION_ID = 'mobile-keyless-presentation' as SessionId
const IMAGE = {
  attachmentId: 'mobile-keyless-image' as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/gif',
  bytes: 35,
  width: 1,
  height: 1,
  name: 'shared-image.gif',
} satisfies ImageAttachmentRef

function tool(
  seq: number,
  callId: string,
  call: NonNullable<ToolResultNode['call']>,
  resultView: ToolResultNode['resultView'],
  content: ToolResultNode['content'] = [],
): ToolResultNode {
  return {
    kind: 'tool-result',
    seq,
    time: seq * 1_000,
    callId,
    call,
    callTime: seq * 1_000 - 500,
    content,
    isError: false,
    callView: null,
    resultView,
    subCalls: [],
  }
}

const conversation: ConversationSnapshot = {
  sessionId: SESSION_ID,
  views: EMPTY_CONVERSATION_VIEWS,
  chat: EMPTY_CHAT_SNAPSHOT,
  nodes: [
    {
      kind: 'user', seq: 1, time: 1_000, source: null,
      content: [{ type: 'text', text: `Shared narrow conversation ${'overflow-'.repeat(24)}` }],
    },
    {
      kind: 'assistant', seq: 2, time: 2_000, turn: 1, step: 1,
      blocks: [
        { kind: 'text', text: '**Shared Markdown**\n\n```ts\nconst mobile = "desktop-web"\n```' },
        { kind: 'image', attachment: IMAGE },
      ],
    },
    tool(
      3,
      'mobile-edit',
      { name: 'edit', argsRaw: '{"file_path":"src/shared-presentation.ts"}' },
      { card: 'diff', diffs: [{ path: 'src/shared-presentation.ts', oldText: 'const shared = false', newText: 'const shared = true' }] },
    ),
    tool(
      4,
      'mobile-bash',
      { name: 'bash', argsRaw: '{"command":"pnpm test","description":"Run focused tests"}' },
      { card: 'terminal', output: '84 tests passed\n', exitCode: 0 },
    ),
    tool(
      5,
      'mobile-unknown',
      { name: 'future_tool', argsRaw: '{"query":"unknown fallback"}' },
      null,
      [{ type: 'text', text: '{"answer":42}' }],
    ),
    { kind: 'turn-error', seq: 6, time: 6_000, turn: 1, step: 1, message: 'Host rejected request', code: 'HOST_400' },
  ],
  turnTimings: new Map(),
  turnEnds: new Map(),
  partial: null,
  runningCalls: [],
  pending: [],
  queue: [],
  running: false,
  subagent: null,
  composerPhase: 'active',
  removed: false,
  openState: 'open',
  openError: null,
  hasMore: false,
  loadingOlder: false,
  promptError: null,
  blank: false,
  lastAgentError: null,
}

/**
 * Create a keyless authoritative-projection example through the production composition interface.
 * @returns development-only Mobile Companion presentation with no mutation authority.
 */
export function developmentCompanionPresentation(): MobileCompanionPresentation {
  return {
    desktopName: 'Keyless projection example',
    connection: 'offline',
    canMutate: false,
    sessions: [{
      id: SESSION_ID,
      title: 'Shared Web presentation',
      workspace: 'DSH',
      summary: 'Authoritative ConversationSnapshot without a model round',
      cwd: '/workspace/deepseek-harness',
      conversation,
    }],
    loadImage: async (sessionId, attachment) => {
      if (sessionId !== SESSION_ID || attachment.attachmentId !== IMAGE.attachmentId) {
        throw new Error('development Mobile image is outside the selected Session')
      }
      return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
    },
  }
}

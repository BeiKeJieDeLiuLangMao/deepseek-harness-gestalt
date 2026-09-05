/**
 * Member-question slot contract: the registrant-side props composition for
 * the conversation-owned input dock, plus the receiver-side Decision Brief
 * face over JSON pending rows from ReceivingQuestionBook. The shared
 * presentation occupies `question.presentation`; this package declares that
 * child and passes JSON plus a Host submit callback.
 */
import type {
  HostObservable, PropsLocale, PropsRenderSlots, PropsRuntime, SnapshotSelectorHook,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { DetailsDocumentFocus } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types'
import type {
  ReceivingMemberQuestionRecord,
  ReceivingPendingQuestion,
  ReceivingQuestionBookView,
  ReceivingQuestionSettleResponse,
} from '@deepseek-ai/dsh-api-session-controller/src/client/sessions/receiving.ts'

/** JSON pending row a member brief renders. */
export type MemberQuestionWait = ReceivingPendingQuestion

/** Collaboration-plane role of the asking member, as the receiver renders it. */
export type MemberQuestionRole = 'owner' | 'admin' | 'member'

/**
 * Remote origin of one member-directed question, bounded to the public
 * identity fields the receiver's brief banner renders. Mirrors the Companion
 * `CompanionMemberQuestionOrigin` face.
 */
export interface MemberQuestionOrigin {
  /** Display name of the cloud project the asking workspace is bound to. */
  projectName: string
  /** One-line title of the originating session; never carries conversation content. */
  originSessionTitle: string
  /** Public display name shown beside the asker avatar. */
  askerDisplayName: string
  /** Avatar image URL rendered beside the display name; absent renders the initial. */
  askerAvatarUrl?: string
  askerRole: MemberQuestionRole
}

/** One referenced document rendered as a material chip. */
export interface MemberQuestionReferenceChip {
  /** File name rendered as the chip title (the path's last segment). */
  filename: string
  /** Why this document matters, rendered as the chip subtitle. */
  reason: string
  /** Workspace-relative document path named by the asking Session. */
  path: string
  /** Receiver-owned hidden Workspace path opened through the Files viewer. */
  cachedPath?: string
  /** Inline document body for tests and older payloads. */
  content?: string
}

/**
 * The receiver-side Decision Brief of one member-question request: everything
 * the banner renders besides the shared question presentation itself.
 */
export interface MemberQuestionBrief {
  /** Remote origin identity; absent renders the identity-lite banner. */
  origin?: MemberQuestionOrigin
  /** Agent-authored decision background, clamped to {@link BACKGROUND_CLAMP} code points. */
  background?: string
  /** Referenced documents, chip order preserved from the request. */
  references: readonly MemberQuestionReferenceChip[]
  /** Epoch milliseconds after which the routed ask expires; absent renders no countdown. */
  expiresAt?: number
}

/** Code-point ceiling of the banner's background block, matching routed-ask construction. */
export const BACKGROUND_CLAMP = 600

/**
 * Clamp the background to the banner's code-point budget without cutting a
 * surrogate pair in half.
 * @param text - the unbounded background text.
 * @returns At most the first 600 code points.
 */
export function clampBackground(text: string): string {
  const points = Array.from(text)
  return points.length <= BACKGROUND_CLAMP ? text : points.slice(0, BACKGROUND_CLAMP).join('')
}

/**
 * The member-question intent carries the receiver projection on the wire
 * (origin identity, background, references, expiry), so this read narrows the
 * carried brief off the batch's shared intent.
 */
type MemberQuestionCarriedIntent = Extract<
  NonNullable<AskUserQuestionItem['intent']>,
  { kind: 'member-question' }
>

/** File name of a referenced document path. */
function filenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Whether a request batch is a member-question request: every question of the
 * batch declares the `member-question` intent. The banner is one request-level
 * Decision Brief, so a batch mixing intents (or carrying any generic or
 * plan-review question) stays with the generic composer entry — an intent
 * changes presentation, never which requests each surface can answer.
 *
 * @param questions - the request's whole question batch.
 * @returns Whether the member-question wrapper claims the request.
 */
export function isMemberQuestionBatch(
  questions: readonly { intent?: { kind: string } & object }[],
): boolean {
  return questions.length > 0
    && questions.every(question => question.intent?.kind === 'member-question')
}

/**
 * Build the banner's Decision Brief over a claimed member-question request.
 * Origin, background, references, and expiry come from the batch's shared
 * carried intent; when a request predates the carried fields (or a test
 * fixture omits them), background falls back to the first supporting detail
 * and the brief renders identity-lite.
 *
 * @param wait - the JSON pending row.
 * @returns The rendered brief.
 */
export function memberBriefOf(wait: MemberQuestionWait): MemberQuestionBrief {
  const intent = wait.questions.find(question => question.intent?.kind === 'member-question')
    ?.intent
  const carried = intent?.kind === 'member-question'
    && (intent as Partial<MemberQuestionCarriedIntent>).origin !== undefined
    ? intent
    : undefined
  const fallback = clampBackground(
    wait.questions.find(question => question.detail !== undefined)?.detail ?? '',
  )
  const background = clampBackground(carried?.background ?? fallback)
  return {
    ...(carried === undefined ? {} : {
      origin: {
        projectName: carried.origin.projectName,
        originSessionTitle: carried.origin.originSessionTitle,
        askerDisplayName: carried.origin.askerDisplayName,
        askerAvatarUrl: carried.origin.askerAvatarUrl,
        askerRole: carried.origin.askerRole,
      },
    }),
    ...(background === '' ? {} : { background }),
    references: (carried?.references ?? []).map(reference => ({
      filename: filenameOf(reference.cachedPath ?? reference.path),
      reason: reference.reason,
      path: reference.path,
      ...(reference.cachedPath === undefined ? {} : { cachedPath: reference.cachedPath }),
      ...(reference.content === undefined ? {} : { content: reference.content }),
    })),
    ...(carried === undefined ? {} : { expiresAt: carried.expiresAt }),
  }
}

/**
 * Claim the member-question banner while the Host pending row is a
 * member-question batch.
 * @param owner - JSON pending row from ReceivingQuestionBook.
 * @returns the pending row when the batch declares the intent, else null.
 */
export function selectMemberQuestion(owner: {
  pending?: MemberQuestionWait | undefined
}): MemberQuestionWait | null {
  const wait = owner.pending
  return wait !== undefined && isMemberQuestionBatch(wait.questions) ? wait : null
}

/**
 * Elect the passive record-band surface after the pending card has gone.
 * @param owner - current receiving projection records.
 * @returns non-empty terminal records, or null when the surface does not apply.
 */
export function selectMemberQuestionRecords(
  owner: { session?: { memberQuestionRecords?: readonly ReceivingMemberQuestionRecord[] } },
): readonly ReceivingMemberQuestionRecord[] | null {
  const records = owner.session?.memberQuestionRecords
  return records === undefined || records.length === 0 ? null : records
}

/**
 * Full component props of the member-question card: dock runtime share,
 * declared presentation child, JSON pending row, locale, and injected verbs.
 */
export type MemberQuestionComposerProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsRenderSlots<'question.presentation'>
  & { matched: MemberQuestionWait }
  & PropsLocale<'member-question'>
  & {
    useReceivingQuestions: SnapshotSelectorHook<ReceivingQuestionBookView>
    settle: (sessionId: SessionId, response: ReceivingQuestionSettleResponse) => Promise<void>
    /**
     * Focus a referenced document in the session's details panel. The callback
     * resolves `ctx.get('detailsFocus')` per gesture; absent providers make it
     * a no-op, and providers registered after this entry are available.
     */
    focusDocument: (sessionId: SessionId, document: DetailsDocumentFocus) => void
    /**
     * Open the receiver-owned cached copy through the registered Files viewer,
     * or the Host system opener when no Files viewer is registered. Callers
     * pass only `cachedPath`; a missing cache is a no-op so a same-named
     * Workspace file is never opened.
     */
    openReference: (sessionId: SessionId, path: string, title?: string) => void
  }

/** Additive input-dock carrier that leaves the product composer mounted. */
export type MemberQuestionDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsRenderSlots<'question.presentation'>
  & PropsLocale<'member-question'>
  & Pick<MemberQuestionComposerProps, 'focusDocument' | 'openReference' | 'settle'>
  & {
    hooks: { receivingQuestions: HostObservable<ReceivingQuestionBookView> }
    useReceivingQuestions: SnapshotSelectorHook<ReceivingQuestionBookView>
  }

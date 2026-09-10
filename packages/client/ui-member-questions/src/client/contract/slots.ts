/**
 * Member-question slot contract: the registrant-side props composition for
 * the conversation-owned input dock, plus the receiver-side Decision Brief
 * face over JSON pending rows from ReceivingQuestionBook. The shared
 * presentation occupies `question.presentation`; this package declares that
 * child and passes JSON plus Host answer/cancel callbacks.
 */
import type {
  HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types'
import type { PendingMemberQuestionView } from '@deepseek-ai/dsh-member-question-receiver/types'
import type {
  ReceivingMemberQuestionRecord,
  ReceivingQuestionBookView,
} from '@deepseek-ai/dsh-api-session-controller/client'

/** Host pending view a member brief renders. */
export type MemberQuestionWait = PendingMemberQuestionView

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
/** File name of a referenced document path. */
function filenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Build the banner's Decision Brief over a Host pending member-question row.
 * Origin, background, references, and expiry come from the Host operation;
 * cached paths come from the Host pending view.
 *
 * @param wait - the Host pending view.
 * @returns The rendered brief.
 */
export function memberBriefOf(wait: MemberQuestionWait): MemberQuestionBrief {
  const origin = wait.operation.origin
  const background = clampBackground(wait.operation.background)
  return {
    origin: {
      projectName: origin.projectName,
      originSessionTitle: origin.originSessionTitle,
      askerDisplayName: origin.askerDisplayName,
      ...(origin.askerAvatarUrl === '' ? {} : { askerAvatarUrl: origin.askerAvatarUrl }),
      askerRole: origin.askerRole,
    },
    ...(background === '' ? {} : { background }),
    references: wait.operation.references.map((reference) => {
      const cachedPath = wait.cachedReferences?.find(entry => entry.path === reference.path)?.cachedPath
      return {
        filename: filenameOf(cachedPath ?? reference.path),
        reason: reference.reason,
        path: reference.path,
        ...(cachedPath === undefined ? {} : { cachedPath }),
      }
    }),
    expiresAt: wait.operation.expiresAt,
  }
}

/**
 * Claim the member-question banner while the Host pending row is present.
 * @param owner - Host pending view from ReceivingQuestionBook.
 * @returns the pending view, or null.
 */
export function selectMemberQuestion(owner: {
  pending?: MemberQuestionWait | undefined
}): MemberQuestionWait | null {
  return owner.pending ?? null
}

/**
 * Map Host operation questions into the shared presentation's JSON batch.
 * @param wait - Host pending view.
 * @returns Ask User items for `question.presentation`.
 */
export function presentationQuestionsOf(wait: MemberQuestionWait): AskUserQuestionItem[] {
  return wait.operation.questions.map(question => ({
    id: question.id,
    question: question.question,
    ...(question.header === undefined ? {} : { header: question.header }),
    ...(question.options === undefined ? {} : { options: question.options.map(option => ({ ...option })) }),
    ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }),
  }))
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

/** Registration-side verbs and receiving projection for the member-question dock. */
export interface MemberQuestionDockInjected {
  /** Answer the pending member question through its receiving Session. */
  settle: (sessionId: SessionId, answers: AskUserQuestionAnswer['answers']) => Promise<void>
  /** Decline the pending member question through its receiving Session. */
  decline: (sessionId: SessionId) => Promise<void>
  /**
   * Open the receiver-owned cached copy through the registered Files viewer,
   * or the Host system opener when no Files viewer is registered. Callers
   * pass only `cachedPath`; a missing cache is a no-op so a same-named
   * Workspace file is never opened.
   */
  openReference: (sessionId: SessionId, path: string, title?: string) => void
  /** Sources bound to selector hooks before the dock component renders. */
  hooks: {
    /** Host-owned pending and terminal member-question projection. */
    receivingQuestions: HostObservable<ReceivingQuestionBookView>
  }
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
  & InjectFace<MemberQuestionDockInjected>

/** Additive input-dock carrier that leaves the product composer mounted. */
export type MemberQuestionDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsRenderSlots<'question.presentation'>
  & PropsLocale<'member-question'>
  & InjectFace<MemberQuestionDockInjected>

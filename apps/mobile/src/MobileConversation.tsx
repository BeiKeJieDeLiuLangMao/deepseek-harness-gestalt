import { useMemo, useRef, type ReactNode } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { CompanionHostFailure } from '@deepseek-ai/dsh-remote-protocol'
import { IconChevronLeftOutline14, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MobileConversationView } from './companion-projection.ts'
import {
  conversationPresentationTranslate,
  questionPresentationTranslate,
  type MobileConversationLocale,
} from './mobile-conversation-copy.ts'
import {
  MobileApprovalForm,
  MobileComposer,
  MobileConversationNodeView,
  MobilePartialAssistant,
  MobileQuestionForm,
  MobileRunningTool,
  messageImageLabels,
} from './mobile-conversation-nodes.tsx'
import css from './MobileConversation.module.css'

/** Full-screen Mobile conversation props. */
export interface MobileConversationProps {
  /** Session title. */
  title: string
  /** Return to the list. */
  onBack: () => void
  /** Desktop-authoritative Mobile conversation view. */
  snapshot: MobileConversationView
  /** Product locale applied to Mobile-owned conversation chrome. */
  locale?: MobileConversationLocale | undefined
  /** Product theme selected by the Mobile shell. */
  theme?: 'light' | 'dark' | undefined
  /** Session-authorized historical-image loader. */
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  /** Session Workspace root used by Tool path summaries. */
  cwd?: string | undefined
  /** Desktop account home used by shared path summaries. */
  home?: string | undefined
  /** Submit a prompt through Desktop acceptance. */
  onSubmit?: ((text: string) => void | Promise<void>) | undefined
  /** Cancel active execution through Desktop cancellation. */
  onCancel?: (() => void) | undefined
  /** Select an attachment for encrypted transfer through Desktop. */
  onAttach?: ((file: File) => void) | undefined
  /** Load the preceding Desktop-authoritative history window. */
  onLoadOlder?: (() => void) | undefined
  /** Whether current foreground synchronization admits mutations. */
  mutationEnabled?: boolean | undefined
  /** Stable Relay or Companion failure retained while the foreground lifecycle retries. */
  connectionAlert?: string | undefined
  /** Latest correlated Companion operation failure. */
  operationFailure?: CompanionHostFailure | undefined
}

/** Phone conversation using Desktop-authoritative JSON conversation views. */
export function MobileConversation({
  title,
  onBack,
  snapshot,
  locale = 'zh',
  theme = 'light',
  loadImage,
  cwd,
  home,
  onSubmit,
  onCancel,
  onAttach,
  onLoadOlder,
  mutationEnabled = false,
  connectionAlert,
  operationFailure,
}: MobileConversationProps): ReactNode {
  const attachmentInput = useRef<HTMLInputElement>(null)
  const t = useMemo(() => conversationPresentationTranslate(locale), [locale])
  const tq = useMemo(() => questionPresentationTranslate(locale), [locale])
  const imageLabels = useMemo(() => messageImageLabels(t), [t])
  const question = snapshot.pending.find((wait): wait is Extract<typeof wait, { kind: 'question' }> => (
    wait.kind === 'question'
  ))
  const approval = snapshot.pending.find((wait): wait is Extract<typeof wait, { kind: 'approval' }> => (
    wait.kind === 'approval'
  ))
  const backLabel = t('nav.back')
  const attachmentLabel = t('attachment.add')
  const displayTitle = snapshot.blank ? t('session.new') : title
  const openError = typeof snapshot.openError === 'object' && snapshot.openError !== null
    ? snapshot.openError as { readonly message?: string; readonly code?: string }
    : undefined
  const attachmentControl = onAttach === undefined ? undefined : (
    <>
      <input
        ref={attachmentInput}
        type="file"
        hidden
        disabled={!mutationEnabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file !== undefined) onAttach(file)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className={css.attachment}
        aria-label={attachmentLabel}
        disabled={!mutationEnabled}
        onClick={() => { if (mutationEnabled) attachmentInput.current?.click() }}
      >
        <IconPlusOutline16 />
      </button>
    </>
  )
  return (
    <section
      className={css.page}
      data-mobile-conversation="detail"
      data-locale={locale}
      data-theme={theme}
      data-ds-dark-theme={theme === 'dark' ? '' : undefined}
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
    >
      <header className={css.header}>
        <button type="button" className={css.back} aria-label={backLabel} onClick={onBack}>
          <IconChevronLeftOutline14 size={20} />
        </button>
        <h1>{displayTitle}</h1>
      </header>
      <div className={css.blocks} data-conversation-scroll="">
        {connectionAlert !== undefined && <p role="alert">{connectionAlert}</p>}
        {operationFailure !== undefined && <p role="alert">{operationFailure.message}</p>}
        {snapshot.openState === 'loading' && <p role="status">{t('chat.loadingHistory')}</p>}
        {snapshot.openState === 'error' && openError !== undefined && (
          <p role="status">{t('chat.loadError', {
            message: openError.message ?? '',
            code: openError.code ?? '',
          })}</p>
        )}
        {snapshot.hasMore && onLoadOlder !== undefined && (
          <button type="button" disabled={snapshot.loadingOlder || !mutationEnabled} onClick={onLoadOlder}>
            {snapshot.loadingOlder ? t('chat.loadingHistory') : t('chat.loadOlder')}
          </button>
        )}
        {snapshot.nodes.map(node => (
          <MobileConversationNodeView
            key={`${node.kind}:${String(node.seq)}`}
            node={node}
            loadImage={loadImage}
            labels={imageLabels}
            t={t}
            cwd={cwd}
            home={home}
          />
        ))}
        {snapshot.partial !== null && (
          <MobilePartialAssistant
            partial={snapshot.partial}
            loadImage={loadImage}
            labels={imageLabels}
            t={t}
          />
        )}
        {snapshot.runningCalls.map((call, index) => (
          <MobileRunningTool key={index} call={call} t={t} cwd={cwd} home={home} />
        ))}
      </div>
      <div className={css.composer}>
        {question !== undefined
          ? <MobileQuestionForm wait={question} t={tq} disabled={!mutationEnabled} />
          : approval !== undefined
            ? <MobileApprovalForm wait={approval} t={t} disabled={!mutationEnabled} />
            : onSubmit !== undefined
              ? <MobileComposer
                conversation={snapshot}
                onSubmit={onSubmit}
                onCancel={onCancel}
                t={t}
                disabled={!mutationEnabled}
                tools={attachmentControl}
              />
              : null}
      </div>
    </section>
  )
}

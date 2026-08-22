import { useMemo, type ReactNode } from 'react'
import type {
  ConversationNode, ConversationSnapshot, PendingWait,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  AssistantMarkdown,
  ConversationApproval,
  ConversationComposer,
  ConversationFailure,
  ConversationUserMessage,
  conversationPresentationTranslate,
  type ConversationPresentationLocale,
} from '@deepseek-ai/dsh-client-ui-conversation/presentation'
import { ToolPresentation } from '@deepseek-ai/dsh-client-ui-tool/presentation'
import { ImageGallery, messageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment/presentation'
import {
  QuestionPresentation, questionPresentationTranslate,
} from '@deepseek-ai/dsh-client-ui-user-questions/presentation'
import css from './MobileConversation.module.css'

/** Full-screen Mobile conversation props. */
export interface MobileConversationProps {
  /** Session title. */
  title: string
  /** Return to the list. */
  onBack: () => void
  /** Desktop-authoritative Session projection. */
  snapshot: ConversationSnapshot
  /** Product locale applied to all shared presentation components. */
  locale?: ConversationPresentationLocale | undefined
  /** Product theme selected by the Mobile shell. */
  theme?: 'light' | 'dark' | undefined
  /** Session-authorized historical-image loader. */
  loadImage?: ((attachment: ImageAttachmentRef) => Promise<string>) | undefined
  /** Submit a prompt through Desktop acceptance. */
  onSubmit?: ((text: string) => void | Promise<void>) | undefined
  /** Cancel active execution through Desktop cancellation. */
  onCancel?: (() => void) | undefined
  /** Load the preceding Desktop-authoritative history window. */
  onLoadOlder?: (() => void) | undefined
}

/** Phone conversation using Desktop-authoritative projections and exported DSH Web presentation. */
export function MobileConversation({
  title,
  onBack,
  snapshot,
  locale = 'zh',
  theme = 'light',
  loadImage,
  onSubmit,
  onCancel,
  onLoadOlder,
}: MobileConversationProps): ReactNode {
  const t = useMemo(() => conversationPresentationTranslate(locale), [locale])
  const tq = useMemo(() => questionPresentationTranslate(locale), [locale])
  const imageLabels = useMemo(() => messageImageLabels(t), [t])
  const renderMessageImages = ({ images, align }: {
    images: readonly { attachment: ImageAttachmentRef }[]
    align: 'start' | 'end'
  }): ReactNode => loadImage === undefined
    ? images.map(({ attachment }) => (
      <JsonBlock
        key={attachment.attachmentId}
        label={attachment.name ?? t('image.label')}
        payload={attachment}
        truncatedLabel={total => t('json.truncated', { total })}
      />
    ))
    : <ImageGallery images={images} load={loadImage} align={align} labels={imageLabels} />
  const question = snapshot.pending.find((wait): wait is PendingWait<'question'> => wait.kind === 'question')
  const approval = snapshot.pending.find((wait): wait is PendingWait<'approval'> => wait.kind === 'approval')

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
        <button type="button" className={css.back} onClick={onBack}>{locale === 'zh' ? '返回' : 'Back'}</button>
        <h1>{title}</h1>
      </header>
      <div className={css.blocks} data-conversation-scroll="">
        {snapshot.openState === 'loading' && <p role="status">{t('chat.loadingHistory')}</p>}
        {snapshot.openState === 'error' && snapshot.openError !== null && (
          <p role="status">{t('chat.loadError', { message: snapshot.openError.message, code: snapshot.openError.code })}</p>
        )}
        {snapshot.hasMore && onLoadOlder !== undefined && (
          <button type="button" disabled={snapshot.loadingOlder} onClick={onLoadOlder}>
            {snapshot.loadingOlder ? t('chat.loadingHistory') : t('chat.loadOlder')}
          </button>
        )}
        {snapshot.nodes.map(node => (
          <ConversationNodePresentation
            key={`${node.kind}:${String(node.seq)}`}
            node={node}
            renderMessageImages={renderMessageImages}
            t={t}
          />
        ))}
        {snapshot.partial !== null && (
          <AssistantMarkdown
            blocks={snapshot.partial.blocks}
            streaming
            renderMessageImages={renderMessageImages}
            t={t}
          />
        )}
        {snapshot.runningCalls.map(call => (
          <ToolPresentation key={call.callId} block={call} t={t} />
        ))}
      </div>
      <div className={css.composer}>
        {question !== undefined
          ? <QuestionPresentation wait={question} t={tq} />
          : approval !== undefined
            ? <ConversationApproval wait={approval} snapshot={snapshot} t={t} />
            : onSubmit !== undefined
              ? <ConversationComposer snapshot={snapshot} onSubmit={onSubmit} onCancel={onCancel} t={t} />
              : null}
      </div>
    </section>
  )
}

function ConversationNodePresentation({
  node,
  renderMessageImages,
  t,
}: {
  node: ConversationNode
  renderMessageImages: Parameters<typeof ConversationUserMessage>[0]['renderMessageImages']
  t: ReturnType<typeof conversationPresentationTranslate>
}): ReactNode {
  switch (node.kind) {
    case 'user':
    case 'steering':
      return <ConversationUserMessage content={node.content} renderMessageImages={renderMessageImages} t={t} />
    case 'assistant':
      return (
        <AssistantMarkdown
          blocks={node.blocks}
          streaming={false}
          interrupted={node.interrupted}
          renderMessageImages={renderMessageImages}
          t={t}
          sourceId={node.messageId}
        />
      )
    case 'tool-result':
      return <ToolPresentation block={node} t={t} />
    case 'turn-error':
    case 'turn-max-tokens':
      return <ConversationFailure node={node} t={t} />
    case 'context':
      return (
        <div className={css.context}>
          {node.content.map((block, index) => block.type === 'text'
            ? <MarkdownText key={index} text={block.text} />
            : <JsonBlock key={index} label={t('message.extraBlock')} payload={block} truncatedLabel={total => t('json.truncated', { total })} />)}
        </div>
      )
    case 'unknown':
      return <JsonBlock label={t('message.unknownSurface', { type: node.type })} payload={node.data} truncatedLabel={total => t('json.truncated', { total })} />
    case 'model-retry':
    case 'command':
    case 'compaction':
      return <JsonBlock label={node.kind} payload={node} truncatedLabel={total => t('json.truncated', { total })} />
    default: {
      const never: never = node
      return never
    }
  }
}

import { useState, type ReactNode } from 'react'
import { settleCompanionInteraction, type CompanionInteraction } from './companion-approval.ts'
import { companionMayMutate, type CompanionConnectionState } from './companion-lifecycle.ts'
import { formatToolArgs, previewTerminalLines, type MobileContentBlock } from './mobile-content.ts'
import css from './MobileConversation.module.css'

/** Full-screen Mobile conversation props. */
export interface MobileConversationProps {
  /** Session title. */
  title: string
  /** Return to the list. */
  onBack: () => void
  /** Desktop-confirmed content blocks. */
  blocks: readonly MobileContentBlock[]
  /** Submit a prompt through Desktop acceptance. */
  onSubmit?: (text: string) => void
  /** Cancel active execution through Desktop cancellation. */
  onCancel?: () => void
  /** Whether Desktop is currently streaming. */
  streaming?: boolean
  /** Process visibility required before any interaction settlement. */
  companionState?: CompanionConnectionState
  /** Receive the Desktop-authoritative interaction after a successful UI settlement. */
  onSettled?: (interaction: CompanionInteraction) => void
}

/** Phone conversation that reuses Gestalt tokens and never exposes terminal input. */
export function MobileConversation({
  title, onBack, blocks, onSubmit, onCancel, streaming = false, companionState, onSettled,
}: MobileConversationProps): ReactNode {
  const [draft, setDraft] = useState('')
  const mayMutate = companionMayMutate(companionState)
  return (
    <section className={css.page} data-mobile-conversation="detail">
      <header className={css.header}>
        <button type="button" className={css.back} onClick={onBack}>返回</button>
        <h1>{title}</h1>
      </header>
      <div className={css.blocks}>
        {blocks.map((block, index) => (
          <ContentBlock
            key={index}
            block={block}
            {...(companionState === undefined ? {} : { companionState })}
            {...(onSettled === undefined ? {} : { onSettled })}
          />
        ))}
      </div>
      {onSubmit !== undefined && (
        <form
          className={css.composer}
          onSubmit={(event) => {
            event.preventDefault()
            if (draft === '' || !mayMutate) return
            onSubmit(draft)
            setDraft('')
          }}
        >
          <textarea
            aria-label="继续会话"
            value={draft}
            onChange={(event) => { setDraft(event.target.value) }}
          />
          <button type="submit" disabled={!mayMutate}>发送</button>
          {onCancel !== undefined && streaming && (
            <button type="button" disabled={!mayMutate} onClick={() => { if (mayMutate) onCancel() }}>取消</button>
          )}
        </form>
      )}
    </section>
  )
}

function ContentBlock({
  block, companionState, onSettled,
}: {
  block: MobileContentBlock
  companionState?: CompanionConnectionState
  onSettled?: (interaction: CompanionInteraction) => void
}): ReactNode {
  switch (block.kind) {
    case 'markdown':
      return <article className={css.markdown}>{block.text}</article>
    case 'code':
      return <pre className={css.code} data-language={block.language}><code>{block.text}</code></pre>
    case 'image':
      return <img className={css.image} alt={block.alt} src={block.src} />
    case 'tool':
      return (
        <section className={css.card} data-kind="tool">
          <h2>{block.name}</h2>
          <pre>{formatToolArgs(block.args)}</pre>
          {block.result !== undefined ? <pre>{formatToolArgs(block.result)}</pre> : null}
        </section>
      )
    case 'diff':
      return (
        <section className={css.card} data-kind="diff">
          <h2>{block.path}</h2>
          <pre className={css.diff}>{block.text}</pre>
        </section>
      )
    case 'approval':
      return (
        <section className={css.card} data-kind="approval">
          <p>{block.summary}</p>
          {companionState !== undefined && (
            <SettlementActions
              interaction={{
                operationId: block.summary,
                kind: 'approval',
                summary: block.summary,
                authorized: ['once'],
              }}
              companionState={companionState}
              {...(onSettled === undefined ? {} : { onSettled })}
            />
          )}
        </section>
      )
    case 'ask-user':
      return (
        <section className={css.card} data-kind="ask-user">
          <p>{block.question}</p>
          {companionState !== undefined && (
            <SettlementActions
              interaction={{
                operationId: block.question,
                kind: 'ask-user',
                summary: block.question,
                authorized: ['A'],
              }}
              companionState={companionState}
              {...(onSettled === undefined ? {} : { onSettled })}
            />
          )}
        </section>
      )
    case 'terminal': {
      const preview = previewTerminalLines(block.lines)
      return (
        <section className={css.card} data-kind="terminal">
          <p>{block.summary}</p>
          <pre>{preview.visible.join('\n')}</pre>
          {preview.spilled > 0 ? <small>还有 {preview.spilled} 行</small> : null}
        </section>
      )
    }
    case 'unknown-tool':
      return (
        <section className={css.card} data-kind="unknown-tool">
          <h2>{block.name}</h2>
          <pre>{formatToolArgs(block.args)}</pre>
          {block.result !== undefined ? <pre>{formatToolArgs(block.result)}</pre> : null}
        </section>
      )
    default: {
      const never: never = block
      return never
    }
  }
}

function SettlementActions({
  interaction, companionState, onSettled,
}: {
  interaction: CompanionInteraction
  companionState: CompanionConnectionState
  onSettled?: (interaction: CompanionInteraction) => void
}): ReactNode {
  const mayMutate = companionMayMutate(companionState)
  return (
    <button
      type="button"
      disabled={!mayMutate}
      onClick={() => {
        const next = settleCompanionInteraction(interaction, { accepted: true, decision: interaction.authorized[0] ?? 'once' }, companionState)
        onSettled?.(next)
      }}
    >
      允许
    </button>
  )
}

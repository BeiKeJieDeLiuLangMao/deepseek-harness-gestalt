import type { ReactNode } from 'react'
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
}

/** Phone conversation that reuses Gestalt tokens and never exposes terminal input. */
export function MobileConversation({ title, onBack, blocks }: MobileConversationProps): ReactNode {
  return (
    <section className={css.page} data-mobile-conversation="detail">
      <header className={css.header}>
        <button type="button" className={css.back} onClick={onBack}>返回</button>
        <h1>{title}</h1>
      </header>
      <div className={css.blocks}>
        {blocks.map((block, index) => <ContentBlock key={index} block={block} />)}
      </div>
    </section>
  )
}

function ContentBlock({ block }: { block: MobileContentBlock }): ReactNode {
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
      return <section className={css.card} data-kind="approval"><p>{block.summary}</p></section>
    case 'ask-user':
      return <section className={css.card} data-kind="ask-user"><p>{block.question}</p></section>
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

import { useState, type ReactNode } from 'react'
import approvalCss from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ApprovalPanel.module.css'
import inputCss from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/InputBar.module.css'
import buttonCss from '@deepseek-ai/dsh-client-ui-primitives/src/Button.module.css'
import { settleCompanionInteraction, type CompanionInteraction } from './companion-approval.ts'
import { companionMayMutate, type CompanionPushState } from './companion-push.ts'
import { formatToolArgs, previewTerminalLines, type MobileContentBlock } from './mobile-content.ts'
import css from './MobileConversation.module.css'

/** Full-screen Mobile conversation props. */
export interface MobileConversationProps {
  /** Session title. */
  title: string
  /** Workspace or Ungrouped label shown under the title. */
  context?: string
  /** Live Remote Online / Offline label for the subtitle. */
  connection?: 'online' | 'offline'
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
  companionState?: CompanionPushState
  /** Receive the Desktop-authoritative interaction after a successful UI settlement. */
  onSettled?: (interaction: CompanionInteraction) => void
  /** Offer one local file through Encrypted Companion after Desktop confirmation. */
  onAttach?: (file: File) => void
  /** Re-run Desktop-authoritative synchronization after Remote Offline. */
  onRecover?: () => void
  /** Waiting for the first Desktop Host transcript page. */
  opening?: boolean
  /** Last Host or transport failure. */
  error?: string
}

/** Phone conversation that reuses Gestalt composer CSS and never exposes terminal input. */
export function MobileConversation({
  title,
  context,
  connection,
  onBack,
  blocks,
  onSubmit,
  onCancel,
  streaming = false,
  companionState,
  onSettled,
  onAttach,
  onRecover,
  opening = false,
  error,
}: MobileConversationProps): ReactNode {
  const [draft, setDraft] = useState('')
  const mayMutate = companionState === undefined || companionMayMutate(companionState)
  const offline = connection === 'offline' || !mayMutate
  const pendingApproval = blocks.find((block): block is Extract<MobileContentBlock, { kind: 'approval' }> => (
    block.kind === 'approval' && block.settled === undefined
  ))
  const approvalComposer = pendingApproval !== undefined && companionState !== undefined && onSettled !== undefined
  const subtitle = context === undefined
    ? undefined
    : `${context} · ${connection === 'offline' ? '暂时离线' : '已连接'}`
  return (
    <section className={css.page} data-mobile-conversation="detail">
      <header className={css.header}>
        <button type="button" className={css.back} onClick={onBack}>返回</button>
        <div>
          <h1>{title}</h1>
          {subtitle !== undefined && <span>{subtitle}</span>}
        </div>
      </header>
      {offline && (
        <div className={css.offline}>
          <span>连接已断开，重新连接后才能继续操作。</span>
          {onRecover !== undefined && (
            <button type="button" onClick={onRecover}>重试</button>
          )}
        </div>
      )}
      {error !== undefined && (
        <div className={css.offline} role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className={css.blocks}>
        {opening && blocks.length === 0 && (
          <p className={css.opening}>正在从 Desktop 读取对话…</p>
        )}
        {blocks.map((block, index) => (
          approvalComposer && block.kind === 'approval' && block.settled === undefined
            ? null
            : (
              <ContentBlock
                key={index}
                block={block}
                {...(companionState === undefined ? {} : { companionState })}
                {...(onSettled === undefined ? {} : { onSettled })}
              />
            )
        ))}
      </div>
      {approvalComposer && pendingApproval !== undefined && companionState !== undefined && (
        <div className={css.composer}>
          {!mayMutate && <p role="alert">Remote Offline 拒绝发送</p>}
          <ApprovalComposer
            block={pendingApproval}
            companionState={companionState}
            {...(onSettled === undefined ? {} : { onSettled })}
          />
        </div>
      )}
      {!approvalComposer && onSubmit !== undefined && (
        <form
          className={css.composer}
          onSubmit={(event) => {
            event.preventDefault()
            if (!mayMutate || draft === '') return
            onSubmit(draft)
            setDraft('')
          }}
        >
          {!mayMutate && <p role="alert">Remote Offline 拒绝发送</p>}
          <InputComposer
            draft={draft}
            mayMutate={mayMutate}
            streaming={streaming}
            onDraft={setDraft}
            {...(onAttach === undefined ? {} : { onAttach })}
            {...(onCancel === undefined ? {} : { onCancel })}
          />
        </form>
      )}
    </section>
  )
}

function InputComposer({
  draft, mayMutate, streaming, onDraft, onAttach, onCancel,
}: {
  draft: string
  mayMutate: boolean
  streaming: boolean
  onDraft: (text: string) => void
  onAttach?: (file: File) => void
  onCancel?: () => void
}): ReactNode {
  return (
    <div className={inputCss.root}>
      <div className={inputCss.card}>
        <div className={inputCss.scroll} data-input-scroll="">
          <div className={inputCss.grow}>
            <div className={inputCss.backdrop} aria-hidden="true" />
            <textarea
              className={inputCss.input}
              aria-label="继续会话"
              placeholder={mayMutate ? '继续对话…' : '等待重新连接…'}
              value={draft}
              disabled={!mayMutate}
              rows={2}
              onChange={(event) => { onDraft(event.target.value) }}
            />
            <div className={inputCss.mirror} aria-hidden="true">{`${draft}\n`}</div>
          </div>
        </div>
        <div className={inputCss.row}>
          <div className={inputCss.tools}>
            {onAttach !== undefined && (
              <label className={inputCss.add}>
                <input
                  type="file"
                  aria-label="添加附件"
                  disabled={!mayMutate}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file === undefined || !mayMutate) return
                    onAttach(file)
                    event.target.value = ''
                  }}
                />
                +
              </label>
            )}
          </div>
          <div className={inputCss.trailing}>
            {onCancel !== undefined && streaming && (
              <button type="button" className={`${buttonCss.button} ${buttonCss.outline} ${buttonCss.md}`} onClick={onCancel}>
                取消
              </button>
            )}
            <button
              type="submit"
              className={`${inputCss.primary}`}
              aria-label="发送"
              disabled={!mayMutate || draft === ''}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ApprovalComposer({
  block, companionState, onSettled,
}: {
  block: Extract<MobileContentBlock, { kind: 'approval' }>
  companionState: CompanionPushState
  onSettled?: (interaction: CompanionInteraction) => void
}): ReactNode {
  return (
    <div className={approvalCss.root} data-approval-key={block.interactionId ?? block.summary}>
      <div className={approvalCss.card}>
        <div className={approvalCss.strip}><span className={approvalCss.dot} />等待审批</div>
        <div className={approvalCss.body} data-approval-scroll="" tabIndex={0} role="group" aria-label="审批详情">
          <div className={approvalCss.headline}>{block.summary}</div>
        </div>
        <div className={approvalCss.actionRow}>
          <SettlementActions
            interaction={{
              operationId: block.interactionId ?? block.summary,
              kind: 'approval',
              summary: block.summary,
              authorized: block.authorized ?? ['once'],
            }}
            companionState={companionState}
            {...(onSettled === undefined ? {} : { onSettled })}
          />
        </div>
      </div>
    </div>
  )
}

function ContentBlock({
  block, companionState, onSettled,
}: {
  block: MobileContentBlock
  companionState?: CompanionPushState
  onSettled?: (interaction: CompanionInteraction) => void
}): ReactNode {
  switch (block.kind) {
    case 'markdown':
      if (block.role === 'assistant') {
        return (
          <div className={css.assistant}>
            <span className={css.mark} aria-hidden="true">DS</span>
            <article>{block.text}</article>
          </div>
        )
      }
      return <article className={block.role === 'user' ? css.user : css.markdown}>{block.text}</article>
    case 'code':
      return <pre className={css.code} data-language={block.language}><code>{block.text}</code></pre>
    case 'image':
      return <img className={css.image} alt={block.alt} src={block.src} />
    case 'tool':
      return (
        <section className={css.tool} data-kind="tool">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{block.name}</strong>
            <small>{block.result === undefined ? '进行中' : '已完成'}</small>
          </div>
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
        <section className={`${css.card} ${css.approval}`} data-kind="approval">
          {block.settled === undefined && <div className={css.strip}><i />等待审批</div>}
          <p>{block.summary}</p>
          {block.cwd !== undefined ? <small>{block.cwd}</small> : null}
          {block.diff !== undefined ? <pre className={css.diff}>{block.diff}</pre> : null}
          {block.terminal !== undefined ? <pre>{block.terminal}</pre> : null}
          {block.settled !== undefined
            ? <p>已允许: {block.settled.decision}</p>
            : companionState !== undefined && (
              <SettlementActions
                interaction={{
                  operationId: block.interactionId ?? block.summary,
                  kind: 'approval',
                  summary: block.summary,
                  authorized: block.authorized ?? ['once'],
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
          {block.settled !== undefined
            ? <p>已回答: {block.settled.decision}</p>
            : companionState !== undefined && (
              <SettlementActions
                interaction={{
                  operationId: block.interactionId ?? block.question,
                  kind: 'ask-user',
                  summary: block.question,
                  authorized: block.authorized ?? ['A'],
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
  companionState: CompanionPushState
  onSettled?: (interaction: CompanionInteraction) => void
}): ReactNode {
  const mayMutate = companionMayMutate(companionState)
  const decisions = interaction.authorized.length > 0 ? interaction.authorized : ['once']
  return (
    <>
      {decisions.map(decision => (
        <button
          key={decision}
          type="button"
          className={decisionClass(interaction.kind, decision)}
          disabled={!mayMutate}
          onClick={() => {
            const next = settleCompanionInteraction(interaction, {
              accepted: true,
              decision,
              ...(decision === 'always' ? { persistent: true } : {}),
            }, companionState)
            onSettled?.(next)
          }}
        >
          {settlementLabel(interaction.kind, decision)}
        </button>
      ))}
    </>
  )
}

function decisionClass(kind: CompanionInteraction['kind'], decision: string): string {
  if (kind === 'approval' && decision === 'once') {
    return `${buttonCss.button} ${buttonCss.primary} ${buttonCss.md}`
  }
  return `${buttonCss.button} ${buttonCss.outline} ${buttonCss.md}`
}

function settlementLabel(kind: CompanionInteraction['kind'], decision: string): string {
  if (kind === 'approval' && decision === 'once') return '允许'
  if (kind === 'approval' && decision === 'always') return '始终允许'
  if (kind === 'approval' && decision === 'rejected') return '取消'
  return decision
}

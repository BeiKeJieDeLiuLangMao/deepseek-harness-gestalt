/** Mobile-owned conversation node, Tool, Approval, Ask User, and composer rendering. */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  DiffBlock,
  DisclosureRow,
  IconApiOutline14,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  JsonBlock,
  MarkdownText,
  TerminalBlock,
  projectUserText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types'
import type {
  MobileConversationNode,
  MobileConversationView,
  MobilePendingApproval,
  MobilePendingQuestion,
} from './companion-projection.ts'
import type { MobileConversationCopy } from './mobile-conversation-copy.ts'

interface ImageGalleryLabels {
  readonly image: string
  readonly open: string
  readonly openNamed: (label: string) => string
  readonly loading: string
  readonly loadFailed: string
}

/** Historical image labels used by the Mobile gallery. */
export function messageImageLabels(t: MobileConversationCopy): ImageGalleryLabels {
  return {
    image: t('image.label'),
    open: t('image.openOriginal'),
    openNamed: label => t('image.openOriginalLabel', { label }),
    loading: t('image.loading'),
    loadFailed: t('image.loadFailed'),
  }
}

function markdownLabels(t: MobileConversationCopy): { code: { copyLabel: string; copiedLabel: string }; footnotes: string } {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('footnotes'),
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function truncatedJson(t: MobileConversationCopy, total: number): string {
  return t('json.truncated', { total })
}

function unknownSurface(t: MobileConversationCopy, type: string): string {
  return t('message.unknownSurface', { type })
}

function ImageGallery({
  images, load, align, labels,
}: {
  images: readonly { attachment: ImageAttachmentRef }[]
  load: (attachment: ImageAttachmentRef) => Promise<string>
  align: 'start' | 'end'
  labels: ImageGalleryLabels
}): ReactNode {
  if (images.length === 0) return null
  return (
    <div data-align={align}>
      {images.map((image, index) => (
        <LoadedImage
          key={`${image.attachment.attachmentId}:${String(index)}`}
          attachment={image.attachment}
          load={load}
          labels={labels}
        />
      ))}
    </div>
  )
}

function LoadedImage({
  attachment, load, labels,
}: {
  attachment: ImageAttachmentRef
  load: (attachment: ImageAttachmentRef) => Promise<string>
  labels: ImageGalleryLabels
}): ReactNode {
  const [src, setSrc] = useState<string | undefined>()
  useEffect(() => {
    let cancelled = false
    void load(attachment).then((url) => { if (!cancelled) setSrc(url) })
    return () => { cancelled = true }
  }, [attachment, load])
  const alt = attachment.name ?? labels.image
  if (src === undefined) return <span>{labels.loading}</span>
  return <img src={src} alt={alt} />
}

function UserMessage({
  node, loadImage, labels, t,
}: {
  node: Record<string, unknown>
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  labels: ImageGalleryLabels
  t: MobileConversationCopy
}): ReactNode {
  const content = asArray(node.content) ?? []
  const texts: string[] = []
  const images: { attachment: ImageAttachmentRef }[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (record?.type === 'text' && typeof record.text === 'string') texts.push(record.text)
    else if (record?.type === 'image' && asRecord(record.attachment) !== undefined) {
      images.push({ attachment: record.attachment as ImageAttachmentRef })
    }
    else rest.push(block)
  }
  return (
    <div>
      <ImageGallery images={images} load={loadImage} align="end" labels={labels} />
      {texts.join('') !== '' && <div>{projectUserText(texts.join(''), [])}</div>}
      {rest.map((block, index) => (
        <JsonBlock
          key={index}
          label={unknownSurface(t, 'block')}
          payload={block}
          truncatedLabel={total => truncatedJson(t, total)}
        />
      ))}
    </div>
  )
}

function AssistantBlocks({
  blocks, loadImage, labels, t, streaming = false,
}: {
  blocks: readonly unknown[]
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  labels: ImageGalleryLabels
  t: MobileConversationCopy
  streaming?: boolean
}): ReactNode {
  const markdown = useMemo(() => markdownLabels(t), [t])
  return (
    <>
      {blocks.map((block, index) => {
        const record = asRecord(block)
        if (record?.kind === 'text' && typeof record.text === 'string') {
          return <MarkdownText key={index} text={record.text} streaming={streaming} labels={markdown} />
        }
        if (record?.kind === 'image' && asRecord(record.attachment) !== undefined) {
          return (
            <div key={index}>
              <ImageGallery
                images={[{ attachment: record.attachment as ImageAttachmentRef }]}
                load={loadImage}
                align="start"
                labels={labels}
              />
            </div>
          )
        }
        return (
          <JsonBlock
            key={index}
            label={unknownSurface(t, asString(record?.kind) ?? 'block')}
            payload={block}
            truncatedLabel={total => truncatedJson(t, total)}
          />
        )
      })}
    </>
  )
}

function parseArgs(argsRaw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    return asRecord(parsed)
  } catch {
    return undefined
  }
}

function toolCall(node: Record<string, unknown>): { name: string; argsRaw: string } | undefined {
  const call = asRecord(node.call)
  const name = asString(call?.name) ?? asString(node.name)
  const argsRaw = asString(call?.argsRaw) ?? asString(node.argsRaw)
  if (name === undefined) return undefined
  return { name, argsRaw: argsRaw ?? '{}' }
}

function displayPath(path: string | undefined, cwd: string | undefined, home: string | undefined): string | undefined {
  if (path === undefined) return undefined
  if (home !== undefined && (path === home || path.startsWith(`${home}/`) || path.startsWith(`${home}\\`))) {
    return `~${path.slice(home.length)}`
  }
  if (cwd !== undefined && (path === cwd || path.startsWith(`${cwd}/`) || path.startsWith(`${cwd}\\`))) {
    return path.slice(cwd.length + (path === cwd ? 0 : 1)) || path
  }
  return path
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function resultText(node: Record<string, unknown>): string {
  const parts: string[] = []
  for (const block of asArray(node.content) ?? []) {
    const record = asRecord(block)
    if (record?.type === 'text' && typeof record.text === 'string') parts.push(record.text)
    else parts.push(JSON.stringify(block, null, 2))
  }
  return parts.join('\n')
}

function diffHunks(node: Record<string, unknown>, args: Record<string, unknown> | undefined): readonly {
  path: string
  oldText: string | null
  newText: string
}[] | undefined {
  const view = asRecord(node.resultView)
  const diffs = asArray(view?.diffs)
  if (diffs !== undefined && diffs.length > 0) {
    const hunks = []
    for (const hunk of diffs) {
      const record = asRecord(hunk)
      const path = asString(record?.path)
      if (path === undefined) return undefined
      const oldText = record?.oldText === null ? null : asString(record?.oldText)
      const newText = asString(record?.newText)
      if (newText === undefined) return undefined
      if (oldText === undefined && record?.oldText !== null) return undefined
      hunks.push({ path, oldText: oldText ?? null, newText })
    }
    return hunks
  }
  const path = asString(args?.file_path) ?? asString(args?.path)
  const oldText = asString(args?.old_string)
  const newText = asString(args?.new_string) ?? asString(args?.content)
  if (path === undefined || newText === undefined) return undefined
  return [{ path, oldText: oldText ?? null, newText }]
}

function ToolCallRow({
  node, t, cwd, home,
}: {
  node: Record<string, unknown>
  t: MobileConversationCopy
  cwd?: string | undefined
  home?: string | undefined
}): ReactNode {
  const call = toolCall(node)
  const name = call?.name ?? 'tool'
  const args = call === undefined ? undefined : parseArgs(call.argsRaw)
  const view = asRecord(node.callView) ?? asRecord(node.resultView)
  const card = asString(view?.card)
  const [open, setOpen] = useState(false)
  const known = name === 'edit' || name === 'write' || name === 'bash'
  const toolview = name === 'edit' || name === 'write' ? 'file-mutation' : name === 'bash' ? 'bash' : 'generic'
  const title = name === 'edit' || name === 'write'
    ? t('tool.title.edit')
    : name === 'bash' ? t('tool.title.bash') : name
  const path = displayPath(asString(args?.file_path) ?? asString(args?.path), cwd, home)
  const summary = path
    ?? asString(args?.description)
    ?? asString(args?.command)
    ?? (call === undefined ? name : firstLine(call.argsRaw))
  const diffs = card === 'diff' || name === 'edit' || name === 'write' ? diffHunks(node, args) : undefined
  const terminal = card === 'terminal' || name === 'bash'
    ? {
      command: asString(view?.title) ?? asString(args?.command) ?? name,
      output: asString(asRecord(node.resultView)?.output) ?? resultText(node),
      exitCode: asNumber(asRecord(node.resultView)?.exitCode),
    }
    : undefined
  const expandable = diffs !== undefined || terminal !== undefined || (!known && call !== undefined)
  return (
    <div data-toolview={toolview}>
      <div data-tool={name} data-variant={known ? name === 'bash' ? 'bash' : 'edit' : 'others'}>
        <DisclosureRow
          icon={<IconApiOutline14 size={14} />}
          title={title}
          open={open}
          expandable={expandable}
          expandOnRowClick
          keepContentWhenOpen
          onToggle={() => { setOpen(value => !value) }}
          collapsedContent={summary === '' ? undefined : <span>{summary}</span>}
        >
          {diffs !== undefined && (
            <DiffBlock
              diffs={[...diffs]}
              labels={{
                copy: t('copy'),
                copied: t('copied'),
                collapseAria: t('diff.collapseAria'),
                expandAria: count => t('diff.expandAria', { count }),
                collapse: t('collapse'),
                expand: count => t('diff.expandRest', { count }),
                files: count => t(count === 1 ? 'diff.files.one' : 'diff.files.other', { count }),
              }}
            />
          )}
          {terminal !== undefined && (
            <TerminalBlock
              command={terminal.command}
              cwd={cwd}
              home={home}
              output={terminal.output}
              exitCode={terminal.exitCode}
              maxLines={16}
              labels={{
                signal: signal => t('terminal.signal', { signal }),
                exitCode: code => t('terminal.exitCode', { code }),
                running: t('terminal.running'),
                failed: t('terminal.failed'),
                done: t('terminal.done'),
                copy: t('copy'),
                copied: t('copied'),
                noOutput: t('terminal.noOutput'),
                collapseAria: t('terminal.collapseAria'),
                collapse: t('collapse'),
                expandAria: hidden => t('terminal.expandAria', { n: hidden }),
                expand: hidden => t('terminal.expandRest', { n: hidden }),
              }}
            />
          )}
          {!known && call !== undefined && diffs === undefined && terminal === undefined && (
            <JsonBlock
              label={name}
              payload={{ args: args ?? call.argsRaw, result: resultText(node) }}
              truncatedLabel={total => truncatedJson(t, total)}
            />
          )}
        </DisclosureRow>
      </div>
    </div>
  )
}

function contextText(node: Record<string, unknown>): string {
  const texts: string[] = []
  for (const block of asArray(node.content) ?? []) {
    const record = asRecord(block)
    if (record?.type === 'text' && typeof record.text === 'string') texts.push(record.text)
  }
  return texts.join('')
}

function ContextRow({ node, t }: { node: Record<string, unknown>; t: MobileConversationCopy }): ReactNode {
  const provenance = asRecord(node.provenance)
  const label = asString(provenance?.label)
  const body = contextText(node)
  const [open, setOpen] = useState(false)
  return (
    <DisclosureRow
      icon={<IconApiOutline14 size={14} />}
      title={t('message.contextInjection')}
      open={open}
      expandable={body !== ''}
      expandOnRowClick
      keepContentWhenOpen
      onToggle={() => { setOpen(value => !value) }}
      collapsedContent={label === undefined ? undefined : <span data-context-source>{label}</span>}
    >
      {body !== '' && <div data-context-injection-body>{body}</div>}
    </DisclosureRow>
  )
}

function CompactionRow({ node, t }: { node: Record<string, unknown>; t: MobileConversationCopy }): ReactNode {
  const markdown = useMemo(() => markdownLabels(t), [t])
  const [open, setOpen] = useState(false)
  const summary = asString(node.summary)
  const items = asNumber(node.shadowedItemCount)
  const tokens = asNumber(node.shadowedTokenCount)
  const caption = items !== undefined && tokens !== undefined
    ? t('message.compaction.completed', { items, tokens })
    : summary === undefined ? t('message.compaction.unavailable') : t('message.compaction.expand')
  return (
    <div>
      <button type="button" disabled={summary === undefined} onClick={() => { setOpen(value => !value) }}>
        <span data-compaction-icon="context"><IconApiOutline14 /></span>
        <span>{t('message.compaction')}</span>
        <span>{caption}</span>
        {open ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
      </button>
      {open && summary !== undefined && <MarkdownText text={summary} labels={markdown} />}
    </div>
  )
}

function CommandRow({ node }: { node: Record<string, unknown> }): ReactNode {
  const outcome = asRecord(node.outcome)
  const text = asString(outcome?.text) ?? asString(node.name) ?? 'command'
  return <div data-variant="others">{text}</div>
}

function RetryRow({ node }: { node: Record<string, unknown> }): ReactNode {
  const failure = asRecord(node.failure)
  const message = asString(failure?.message) ?? asString(node.message) ?? 'retry'
  return <div>{message}</div>
}

function TurnFailure({ node, t }: { node: Record<string, unknown>; t: MobileConversationCopy }): ReactNode {
  const message = asString(node.message)
  const code = asString(node.code)
  return (
    <div role="status">
      {node.kind === 'turn-error' ? message : t('placeholder.unavailable')}
      {code !== undefined && <div>{code}</div>}
    </div>
  )
}

/**
 * Render one Desktop-authoritative conversation node through Mobile-owned chrome.
 * @param props - JSON node, image loader, and copy.
 * @returns the node presentation.
 */
export function MobileConversationNodeView({
  node, loadImage, labels, t, cwd, home,
}: {
  node: MobileConversationNode
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  labels: ImageGalleryLabels
  t: MobileConversationCopy
  cwd?: string | undefined
  home?: string | undefined
}): ReactNode {
  const record = node as unknown as Record<string, unknown>
  switch (node.kind) {
    case 'user':
    case 'steering':
      return <UserMessage node={record} loadImage={loadImage} labels={labels} t={t} />
    case 'assistant':
      return <AssistantBlocks blocks={asArray(record.blocks) ?? []} loadImage={loadImage} labels={labels} t={t} />
    case 'tool-result':
      return <ToolCallRow node={record} t={t} cwd={cwd} home={home} />
    case 'context':
      return <ContextRow node={record} t={t} />
    case 'compaction':
      return <CompactionRow node={record} t={t} />
    case 'command':
      return <CommandRow node={record} />
    case 'model-retry':
      return <RetryRow node={record} />
    case 'turn-error':
    case 'turn-max-tokens':
      return <TurnFailure node={record} t={t} />
    default:
      return (
        <JsonBlock
          label={unknownSurface(t, node.kind)}
          payload={node}
          truncatedLabel={total => truncatedJson(t, total)}
        />
      )
  }
}

/**
 * Render a streaming assistant prefix.
 * @param props - partial blocks and image loader.
 * @returns streaming Markdown and images.
 */
export function MobilePartialAssistant({
  partial, loadImage, labels, t,
}: {
  partial: unknown
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  labels: ImageGalleryLabels
  t: MobileConversationCopy
}): ReactNode {
  const record = asRecord(partial)
  const blocks = asArray(record?.blocks) ?? []
  return <AssistantBlocks blocks={blocks} loadImage={loadImage} labels={labels} t={t} streaming />
}

/**
 * Render a running Tool call through the same Tool row as settled results.
 * @param props - JSON running call.
 * @returns Tool row.
 */
export function MobileRunningTool({
  call, t, cwd, home,
}: {
  call: unknown
  t: MobileConversationCopy
  cwd?: string | undefined
  home?: string | undefined
}): ReactNode {
  const record = asRecord(call)
  if (record === undefined) return null
  return <ToolCallRow node={record} t={t} cwd={cwd} home={home} />
}

/**
 * Render Approval allow-once and reject actions.
 * @param props - JSON pending Approval and mutation lock.
 * @returns Approval takeover.
 */
export function MobileApprovalForm({
  wait, t, disabled = false,
}: {
  wait: MobilePendingApproval
  t: MobileConversationCopy
  disabled?: boolean
}): ReactNode {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  const [selected, setSelected] = useState<'allowed-once' | 'rejected' | undefined>(wait.draft.outcome)
  const locked = disabled || pending
  const headline = wait.reason !== undefined && wait.reason !== ''
    ? wait.reason
    : wait.toolName !== ''
      ? t('approval.escalation', { toolName: wait.toolName })
      : t('placeholder.unavailable')
  const settle = (outcome: 'allowed-once' | 'rejected'): void => {
    if (locked) return
    setSelected(outcome)
    setPending(true)
    setFailure(undefined)
    void wait.answer(outcome).then(
      () => { setPending(false) },
      (cause: unknown) => {
        setPending(false)
        setSelected(wait.draft.outcome ?? outcome)
        setFailure(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }
  const shown = wait.draft.outcome ?? selected
  return (
    <div role="group" aria-label={t('approval.detailAria')}>
      <p>{t('approval.waiting')}</p>
      <p>{headline}</p>
      {failure !== undefined && <p role="alert">{failure}</p>}
      <button
        type="button"
        disabled={locked}
        aria-pressed={shown === 'rejected'}
        onClick={() => { settle('rejected') }}
      >
        {t('approval.reject')}
      </button>
      <button
        type="button"
        disabled={locked}
        aria-pressed={shown === 'allowed-once'}
        onClick={() => { settle('allowed-once') }}
      >
        {t('approval.allowOnce')}
      </button>
    </div>
  )
}

/**
 * Render Ask User options and submit/cancel through JSON pending actions.
 * @param props - JSON pending question, copy, and mutation lock.
 * @returns Ask User form.
 */
export function MobileQuestionForm({
  wait, t, disabled = false,
}: {
  wait: MobilePendingQuestion
  t: MobileConversationCopy
  disabled?: boolean
}): ReactNode {
  const questions = wait.questions
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState(() => questions.map((question) => {
    const stored = wait.draft.answers?.find(item => item.id === question.id)
    return { selected: stored?.selected ?? [], custom: stored?.custom ?? '' }
  }))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  const last = questions.length - 1
  const question = questions[index]
  if (question === undefined) return null
  const draft = drafts[index] ?? { selected: [], custom: '' }
  const options = question.options ?? []
  const restoreDrafts = (): void => {
    const stored = wait.draft.answers
    if (stored === undefined) return
    setDrafts(questions.map((question) => {
      const item = stored.find(answer => answer.id === question.id)
      return { selected: item?.selected ?? [], custom: item?.custom ?? '' }
    }))
  }
  const collectAnswers = (): AskUserQuestionAnswer['answers'] => questions.map((item, itemIndex) => {
    const stored = wait.draft.answers?.find(answer => answer.id === item.id)
    const value = drafts[itemIndex] ?? {
      selected: stored?.selected ?? [],
      custom: stored?.custom ?? '',
    }
    const custom = value.custom.trim()
    return {
      id: item.id,
      selected: custom === '' || item.multiSelect === true ? value.selected : [],
      ...(custom === '' ? {} : { custom }),
    }
  })
  const submit = (): void => {
    if (disabled || busy) return
    const answers = collectAnswers()
    setBusy(true)
    setFailure(undefined)
    void wait.answer({ answers }).then(
      () => { setBusy(false) },
      (cause: unknown) => {
        setBusy(false)
        restoreDrafts()
        setFailure(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }
  const choose = (label: string): void => {
    setDrafts(current => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      if (question.multiSelect === true) {
        const selected = item.selected.includes(label)
          ? item.selected.filter(value => value !== label)
          : [...item.selected, label]
        return { ...item, selected }
      }
      return { selected: [label], custom: '' }
    }))
  }
  const answered = draft.selected.length > 0 || draft.custom.trim() !== ''
  const skip = (): void => {
    setDrafts(current => current.map((item, itemIndex) => (
      itemIndex === index ? { selected: [], custom: '' } : item
    )))
    if (index < last) setIndex(current => current + 1)
    else {
      const answers = questions.map((item, itemIndex) => {
        if (itemIndex === index) return { id: item.id, selected: [] }
        const value = drafts[itemIndex] ?? { selected: [], custom: '' }
        const custom = value.custom.trim()
        return {
          id: item.id,
          selected: custom === '' || item.multiSelect === true ? value.selected : [],
          ...(custom === '' ? {} : { custom }),
        }
      })
      setBusy(true)
      setFailure(undefined)
      void wait.answer({ answers }).then(
        () => { setBusy(false) },
        (cause: unknown) => {
          setBusy(false)
          restoreDrafts()
          setFailure(cause instanceof Error ? cause.message : String(cause))
        },
      )
    }
  }
  const setCustom = (custom: string): void => {
    setDrafts(current => current.map((item, itemIndex) => (
      itemIndex === index
        ? { selected: question.multiSelect === true ? item.selected : [], custom }
        : item
    )))
  }
  return (
    <fieldset disabled={disabled || busy}>
      <h2>{question.question}</h2>
      {question.detail !== undefined && question.detail !== '' && <p>{question.detail}</p>}
      <div role={question.multiSelect === true ? 'group' : 'radiogroup'}>
        {options.map((option, optionIndex) => {
          const selected = draft.selected.includes(option.label)
          return (
            <button
              key={`${option.label}:${String(optionIndex)}`}
              type="button"
              role={question.multiSelect === true ? 'checkbox' : 'radio'}
              aria-checked={selected}
              aria-label={option.label}
              onClick={() => { choose(option.label) }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <textarea
        aria-label={t('custom.placeholder')}
        placeholder={t('custom.placeholder')}
        value={draft.custom}
        disabled={disabled || busy}
        onChange={(event) => { setCustom(event.target.value) }}
      />
      {failure !== undefined && <p role="alert">{failure}</p>}
      <button type="button" disabled={disabled || busy} onClick={() => { void wait.cancel() }}>
        {t('nav.cancel')}
      </button>
      <button type="button" disabled={disabled || busy} onClick={skip}>
        {t('action.skip')}
      </button>
      <button
        type="button"
        aria-label={t('nav.prev')}
        disabled={disabled || busy || index === 0}
        onClick={() => { setIndex(current => Math.max(0, current - 1)) }}
      >
        {t('nav.prev')}
      </button>
      {index < last
        ? (
          <button
            type="button"
            aria-label={t('nav.next')}
            disabled={disabled || busy || !answered}
            onClick={() => { setIndex(current => Math.min(last, current + 1)) }}
          >
            {t('action.next')}
          </button>
        )
        : (
          <button
            type="button"
            disabled={disabled || busy || !answered}
            onClick={submit}
          >
            {busy ? t('submitting') : t('submit')}
          </button>
        )}
    </fieldset>
  )
}

/**
 * Render the Mobile composer with send/stop, undo/redo, and paste.
 * @param props - conversation running state and Desktop submit/cancel.
 * @returns composer card.
 */
export function MobileComposer({
  conversation, onSubmit, onCancel, t, disabled = false, tools,
}: {
  conversation: MobileConversationView
  onSubmit: (text: string) => void | Promise<void>
  onCancel?: (() => void) | undefined
  t: MobileConversationCopy
  disabled?: boolean
  tools?: ReactNode
}): ReactNode {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()
  const undo = useRef<string[]>([])
  const redo = useRef<string[]>([])
  const locked = disabled || busy || conversation.removed
  const apply = (next: string, recordHistory: boolean): void => {
    if (recordHistory && next !== draft) {
      undo.current.push(draft)
      redo.current = []
    }
    setDraft(next)
  }
  const submit = (): void => {
    const text = draft.trim()
    if (text === '' || locked) return
    setBusy(true)
    setNotice(undefined)
    void Promise.resolve(onSubmit(text)).then(
      () => {
        undo.current = []
        redo.current = []
        setDraft('')
        setBusy(false)
      },
      (cause: unknown) => {
        setBusy(false)
        setNotice(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z' || event.key === 'y')) {
      event.preventDefault()
      if (locked) return
      if (event.key === 'y' || event.shiftKey) {
        const next = redo.current.pop()
        if (next === undefined) return
        undo.current.push(draft)
        setDraft(next)
        return
      }
      const previous = undo.current.pop()
      if (previous === undefined) return
      redo.current.push(draft)
      setDraft(previous)
      return
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (event.repeat || locked) return
    submit()
  }
  return (
    <div>
      {notice !== undefined && <div role="alert">{notice}</div>}
      <div data-composer-card>
        <textarea
          value={draft}
          disabled={locked}
          placeholder={t(conversation.removed ? 'placeholder.unavailable' : 'placeholder.default')}
          rows={2}
          onChange={(event) => { apply(event.target.value, true) }}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            if (locked) return
            const text = event.clipboardData.getData('text/plain')
            if (text === '') return
            event.preventDefault()
            const start = event.currentTarget.selectionStart
            const end = event.currentTarget.selectionEnd
            apply(`${draft.slice(0, start)}${text}${draft.slice(end)}`, true)
          }}
        />
        <div>
          {tools}
          <button
            type="button"
            aria-label={conversation.running ? t('input.stop') : t('input.send')}
            disabled={conversation.running ? disabled || onCancel === undefined : locked || draft.trim() === ''}
            onClick={conversation.running ? () => { onCancel?.() } : submit}
          >
            {conversation.running ? t('input.stop') : t('input.send')}
          </button>
        </div>
      </div>
    </div>
  )
}

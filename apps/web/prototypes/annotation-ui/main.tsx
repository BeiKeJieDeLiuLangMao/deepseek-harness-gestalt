/**
 * PROTOTYPE ONLY — three Composer annotation UI directions on one route,
 * switchable with ?variant=A|B|C. State is intentionally browser-memory only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BrandWordmark, Button } from '@deepseek-ai/dsh-client-ui-primitives'
import screenshot from '../../../../docs/user/guide/providers-models-page.zh.png'
import '../../../../packages/client/web/src/base.css'
import './prototype.css'

type Variant = 'A' | 'B' | 'C'
type Annotation =
  | { id: number; kind: 'text'; quote: string; note: string }
  | { id: number; kind: 'image'; label: string; note: string; x: number; y: number }

const VARIANTS: readonly Variant[] = ['A', 'B', 'C']
const VARIANT_NAMES: Record<Variant, string> = {
  A: '内联批示',
  B: '审阅工作台',
  C: '页边批语',
}

const INITIAL: Annotation[] = [
  { id: 1, kind: 'text', quote: '模型可见的输入必须能够从 Session log 完整重建', note: '这条原则请再给一个反例。' },
  { id: 2, kind: 'image', label: '模型设置截图', note: '这里的默认模型为什么没有继承工作区设置？', x: 69, y: 34 },
  { id: 3, kind: 'text', quote: '提交后，批示不再保留独立身份', note: '' },
]

function variantFromUrl(): Variant {
  const value = new URLSearchParams(window.location.search).get('variant')
  return value === 'B' || value === 'C' ? value : 'A'
}

function Icon({ name }: { name: 'plus' | 'send' | 'trash' | 'edit' | 'image' | 'quote' | 'close' | 'copy' | 'comment' }) {
  const paths = {
    plus: 'M8 2v12M2 8h12',
    send: 'M2.5 3.2 14 8 2.5 12.8 4.2 8 2.5 3.2ZM4.2 8H10',
    trash: 'M3 4.5h10M6 2.5h4M5 6.5v6M8 6.5v6M11 6.5v6M4 4.5l.7 9h6.6l.7-9',
    edit: 'm3 11.5.5-3L10.7 1.3l3 3-7.2 7.2-3 .5ZM9.7 2.3l3 3',
    image: 'M2 3h12v10H2zM4 10l2.3-2.3 2.1 2.1 1.6-1.6L13 11M5 6h.01',
    quote: 'M3 5.5h4v4H3v-3c0-2 1-3 3-3M9 5.5h4v4H9v-3c0-2 1-3 3-3',
    close: 'm3 3 10 10M13 3 3 13',
    copy: 'M5 5h8v8H5zM3 11H2V2h9v1',
    comment: 'M2.5 3.5h11v7h-6l-3.5 2v-2h-1.5zM5 6.5h6M5 8.5h4',
  }
  return <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d={paths[name]} /></svg>
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand"><BrandWordmark size={21} /></div>
      <button className="new-session"><Icon name="plus" />新会话</button>
      <div className="side-label">今天</div>
      <button className="session active"><span className="session-dot" />Composer 文本和图片批示</button>
      <button className="session">检查 Session 持久化边界</button>
      <button className="session">整理图片附件流程</button>
      <div className="side-label">昨天</div>
      <button className="session">Web Host 布局评审</button>
      <div className="sidebar-footer">
        <div className="avatar">逸</div>
        <div><strong>逸殊</strong><span>本地工作区</span></div>
        <button aria-label="更多">•••</button>
      </div>
    </aside>
  )
}

function Header({ count }: { count: number }) {
  return (
    <header className="header">
      <div>
        <div className="crumb">deepseek-harness <span>/</span> Session</div>
        <h1>Composer 文本和图片批示</h1>
      </div>
      <div className="header-actions">
        {count > 0 && <span className="draft-status"><span />批示草稿已保存</span>}
        <button>···</button>
      </div>
    </header>
  )
}

function UserPrompt() {
  return <div className="user-row"><div className="user-bubble">把文本和图片批示都实现到当前项目，交互要自然。</div></div>
}

function ImageAnnotationLightbox({ annotations, active, orderOf, onActivate, onAddPin, onNote, onClose }: {
  annotations: Extract<Annotation, { kind: 'image' }>[]
  active: number | null
  orderOf: (id: number) => number
  onActivate: (id: number) => void
  onAddPin: (x: number, y: number) => number
  onNote: (id: number, note: string) => void
  onClose: () => void
}) {
  const [annotating, setAnnotating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const activeItem = annotations.find(item => item.id === editingId)
  const addPin = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!annotating) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    const id = onAddPin(Number(x.toFixed(1)), Number(y.toFixed(1)))
    setEditingId(id)
  }
  return (
    <div className="image-lightbox" role="dialog" aria-label="图片预览">
      <div className="lightbox-top-actions">
        <button
          className={`annotate-mode-button ${annotating ? 'is-active' : ''}`}
          onClick={() => setAnnotating(value => !value)}
          aria-pressed={annotating}
        ><Icon name="edit" />{annotating ? '完成批示' : '批示'}</button>
        <button className="lightbox-close" onClick={onClose} aria-label="关闭图片预览"><Icon name="close" /></button>
      </div>
      {annotating && <div className="lightbox-hint"><span />点击图片添加批示点位</div>}
      <div className={`lightbox-canvas ${annotating ? 'is-annotating' : ''}`} onClick={addPin}>
        <img src={screenshot} alt="模型设置截图" />
        {annotations.map((item, index) => (
          <button
            key={item.id}
            className={`image-pin lightbox-pin ${active === item.id ? 'is-active' : ''}`}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            onClick={(event) => {
              event.stopPropagation()
              setAnnotating(true)
              setEditingId(item.id)
              onActivate(item.id)
            }}
            aria-label={`编辑图片批示 ${index + 1}`}
          ><span>{orderOf(item.id)}</span></button>
        ))}
      </div>
      {annotating && activeItem !== undefined && (
        <ImagePinPopover
          key={activeItem.id}
          item={activeItem}
          index={orderOf(activeItem.id) - 1}
          onSave={(value) => {
            onNote(activeItem.id, value)
            setEditingId(null)
          }}
        />
      )}
    </div>
  )
}

function ImagePinPopover({ item, index, onSave }: {
  item: Extract<Annotation, { kind: 'image' }>
  index: number
  onSave: (value: string) => void
}) {
  const horizontal = item.x > 64 ? 'opens-left' : 'opens-right'
  const vertical = item.y < 24 ? 'align-top' : item.y > 76 ? 'align-bottom' : 'align-center'
  return (
    <div
      className={`annotation-input-popover pin-popover ${horizontal} ${vertical}`}
      style={{ left: `${item.x}%`, top: `${item.y}%` }}
      onClick={event => event.stopPropagation()}
    >
      <AnnotationDraftInput index={index} kind="图片" initialValue={item.note} onSave={onSave} />
    </div>
  )
}

function TextSelectionPopover({ index, initialValue, left, top, onSave }: {
  index: number
  initialValue: string
  left: number
  top: number
  onSave: (value: string) => void
}) {
  return (
    <div className="annotation-input-popover text-popover" style={{ left, top }}>
      <AnnotationDraftInput index={index} kind="文本" initialValue={initialValue} onSave={onSave} />
    </div>
  )
}

function AnnotationDraftInput({ index, kind, initialValue, onSave }: {
  index: number
  kind: '文本' | '图片'
  initialValue: string
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState(initialValue)
  const [composing, setComposing] = useState(false)
  const canSave = draft.trim() !== '' || initialValue !== ''
  const save = () => {
    if (!canSave) return
    onSave(draft.trim())
  }
  return (
    <>
      <div className={`annotation-popover-title kind-${kind === '图片' ? 'image' : 'text'}`}><span>{index + 1}</span>添加{kind}批示</div>
      <textarea
        autoFocus
        value={draft}
        placeholder="输入批示内容"
        onChange={event => setDraft(event.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || composing || event.keyCode === 229) return
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            save()
          }
        }}
      />
      <div className="annotation-popover-actions">
        <span>Enter 提交 · Shift + Enter 换行</span>
        <button disabled={!canSave} onClick={save} aria-label={`提交${kind}批示`}><Icon name="send" /></button>
      </div>
    </>
  )
}

function AssistantSource({ annotations, active, onActivate, onAddText, onAddImagePin, onNote, onDelete, variant }: {
  annotations: Annotation[]
  active: number | null
  onActivate: (id: number) => void
  onAddText: (quote: string) => number
  onAddImagePin: (x: number, y: number) => number
  onNote: (id: number, note: string) => void
  onDelete: (id: number) => void
  variant: Variant
}) {
  const [selectionMenu, setSelectionMenu] = useState<{
    quote: string
    left: number
    top: number
    editorLeft: number
    editorTop: number
  } | null>(null)
  const [textEditor, setTextEditor] = useState<{ id: number; left: number; top: number } | null>(null)
  const [imageOpen, setImageOpen] = useState(false)
  const first = annotations.find((item): item is Extract<Annotation, { kind: 'text' }> => item.id === 1 && item.kind === 'text')
  const third = annotations.find((item): item is Extract<Annotation, { kind: 'text' }> => item.id === 3 && item.kind === 'text')
  const images = annotations.filter((item): item is Extract<Annotation, { kind: 'image' }> => item.kind === 'image')
  const textEditingItem = textEditor === null ? undefined : annotations.find((item): item is Extract<Annotation, { kind: 'text' }> => item.id === textEditor.id && item.kind === 'text')
  const textEditorPosition = (rect: DOMRect) => ({
    left: Math.min(rect.right + 16, window.innerWidth - 302),
    top: Math.max(108, Math.min(rect.top + rect.height / 2, window.innerHeight - 108)),
  })
  const selectText = (event: ReactMouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return
    const quote = selection.toString().trim()
    const range = selection.getRangeAt(0)
    if (quote === '' || !event.currentTarget.contains(range.commonAncestorContainer)) return
    const rect = range.getBoundingClientRect()
    const editor = textEditorPosition(rect)
    setSelectionMenu({ quote, left: rect.left + rect.width / 2, top: rect.top - 9, editorLeft: editor.left, editorTop: editor.top })
  }
  const addSelectedText = () => {
    if (selectionMenu === null) return
    const id = onAddText(selectionMenu.quote)
    setTextEditor({ id, left: selectionMenu.editorLeft, top: selectionMenu.editorTop })
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }
  const editText = (item: Extract<Annotation, { kind: 'text' }>, rect: DOMRect) => {
    onActivate(item.id)
    setTextEditor({ id: item.id, ...textEditorPosition(rect) })
  }
  const openImage = () => {
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    setImageOpen(true)
  }
  return (
    <article className={`assistant-source source-${variant.toLowerCase()}`}>
      <div className="assistant-mark">DS</div>
      <div className="assistant-copy" onMouseUp={selectText}>
        <p>我建议把它做成 Composer 自己的输入能力，而不是注册外部插件。最重要的架构原则是：</p>
        <blockquote>
          {first ? (
            <span className={`source-highlight ${active === 1 ? 'is-active' : ''}`} onClick={event => editText(first, event.currentTarget.getBoundingClientRect())}>
              <span className="source-number">{annotations.indexOf(first) + 1}</span>
              模型可见的输入必须能够从 Session log 完整重建
            </span>
          ) : (
            <button className="source-add" onClick={() => onActivate(1)}><Icon name="plus" />选择这段文字</button>
          )}
        </blockquote>
        <p>发送前，文本锚点和图片点位都属于当前 Session 的 Annotation Draft；刷新页面后仍可继续编辑。</p>
        <div className="history-image-wrap" onClick={openImage} role="button" tabIndex={0}>
          <img src={screenshot} alt="模型设置截图" className="history-image" />
          {images.map((image, index) => (
            <button
              key={image.id}
              className={`image-pin ${active === image.id ? 'is-active' : ''}`}
              style={{ left: `${image.x}%`, top: `${image.y}%` }}
              onClick={(event) => { event.stopPropagation(); openImage(); onActivate(image.id) }}
              aria-label={`打开图片批示 ${index + 1}`}
            ><span>{annotations.indexOf(image) + 1}</span></button>
          ))}
          <span className="image-caption"><Icon name="image" />模型设置截图 · 历史图片</span>
        </div>
        <p>
          发送时把问题、引用和坐标编译为普通自然语言消息。
          {third ? (
            <span className={`source-highlight compact ${active === 3 ? 'is-active' : ''}`} onClick={event => editText(third, event.currentTarget.getBoundingClientRect())}>
              <span className="source-number">{annotations.indexOf(third) + 1}</span>
              提交后，批示不再保留独立身份
            </span>
          ) : <button className="inline-add" onClick={() => onActivate(3)}>＋ 批示这句话</button>}。
        </p>
      </div>
      {selectionMenu !== null && (
        <div className="selection-toolbar" style={{ left: selectionMenu.left, top: selectionMenu.top }}>
          <button className="selection-primary" onMouseDown={event => event.preventDefault()} onClick={addSelectedText}><Icon name="edit" />添加批示</button>
          <button onMouseDown={event => event.preventDefault()}><Icon name="copy" />复制</button>
        </div>
      )}
      {textEditor !== null && textEditingItem !== undefined && (
        <TextSelectionPopover
          key={textEditingItem.id}
          index={annotations.indexOf(textEditingItem)}
          initialValue={textEditingItem.note}
          left={textEditor.left}
          top={textEditor.top}
          onSave={(value) => {
            onNote(textEditingItem.id, value)
            setTextEditor(null)
          }}
        />
      )}
      {imageOpen && (
        <ImageAnnotationLightbox
          annotations={images}
          active={active}
          orderOf={id => annotations.findIndex(item => item.id === id) + 1}
          onActivate={onActivate}
          onAddPin={onAddImagePin}
          onNote={onNote}
          onClose={() => setImageOpen(false)}
        />
      )}
    </article>
  )
}

function AnnotationType({ item }: { item: Annotation }) {
  return <span className={`annotation-type ${item.kind}`}><Icon name={item.kind === 'text' ? 'quote' : 'image'} />{item.kind === 'text' ? '文本' : '图片'}</span>
}

function Editor({ item, index, onNote, onDelete, compact = false }: {
  item: Annotation
  index: number
  onNote: (value: string) => void
  onDelete: () => void
  compact?: boolean
}) {
  return (
    <div className={`annotation-editor ${compact ? 'is-compact' : ''}`}>
      <div className="editor-head"><span className="editor-index">{index + 1}</span><AnnotationType item={item} /><button className="icon-button danger" onClick={onDelete} aria-label="删除批示"><Icon name="trash" /></button></div>
      <div className="editor-source">{item.kind === 'text' ? `“${item.quote}”` : `${item.label} · ${item.x}%, ${item.y}%`}</div>
      <label>批语<textarea value={item.note} placeholder="可留空" onChange={event => onNote(event.target.value)} /></label>
    </div>
  )
}

function CompactCard({ item, index, active, onActivate, onDelete }: {
  item: Annotation
  index: number
  active: boolean
  onActivate: () => void
  onDelete: () => void
}) {
  return (
    <div className={`compact-card ${active ? 'is-active' : ''}`} onClick={onActivate}>
      <span className="compact-index">{index + 1}</span>
      <div><AnnotationType item={item} /><strong>{item.note || (item.kind === 'text' ? item.quote : `${item.x}%, ${item.y}%`)}</strong></div>
      <button className="icon-button" onClick={(event) => { event.stopPropagation(); onDelete() }} aria-label="删除批示"><Icon name="close" /></button>
    </div>
  )
}

function AnnotationSummary({ annotations }: { annotations: Annotation[] }) {
  return (
    <div className="annotation-summary">
      <button className="annotation-summary-trigger" aria-describedby="annotation-summary-details"><Icon name="comment" />{annotations.length} 条注释</button>
      <div className="annotation-summary-details" id="annotation-summary-details" role="tooltip">
        {annotations.map((item, index) => (
          <div className="annotation-summary-item" key={item.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{item.note || '尚未填写批示内容'}</strong>
              <small>{item.kind === 'text' ? `“${item.quote}”` : `${item.label} · ${item.x}%, ${item.y}%`}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Composer({ question, onQuestion, annotations, active, onActivate, onDelete, onDiscard, onSend, mode }: {
  question: string
  onQuestion: (value: string) => void
  annotations: Annotation[]
  active: number | null
  onActivate: (id: number) => void
  onDelete: (id: number) => void
  onDiscard: () => void
  onSend: () => void
  mode: 'ledger' | 'minimal' | 'timeline'
}) {
  return (
    <div className={`composer composer-${mode}`}>
      {mode === 'ledger' && annotations.length > 0 && <AnnotationSummary annotations={annotations} />}
      {mode === 'timeline' && annotations.length > 0 && (
        <div className="composer-timeline">
          <div className="timeline-title"><span>批示草稿</span><strong>{annotations.length} 项</strong></div>
          {annotations.map((item, index) => (
            <CompactCard
              key={item.id}
              item={item}
              index={index}
              active={active === item.id}
              onActivate={() => onActivate(item.id)}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </div>
      )}
      {mode === 'minimal' && annotations.length > 0 && <button className="minimal-badge"><span>{annotations.length}</span>条批示待发送</button>}
      <textarea value={question} onChange={event => onQuestion(event.target.value)} placeholder="补充一个问题（可选）" />
      <div className="composer-actions">
        <div className="composer-left"><button aria-label="添加附件">＋</button><button>DeepSeek V4 Flash⌄</button><button>Agent⌄</button></div>
        <div className="composer-right">
          {annotations.length > 0 && <button className="discard" onClick={onDiscard}>丢弃批示</button>}
          <Button variant="primary" size="sm" icon={<Icon name="send" />} onClick={onSend} disabled={annotations.length === 0 && question.trim() === ''}>发送</Button>
        </div>
      </div>
    </div>
  )
}

function SentBubble({ text }: { text: string | null }) {
  if (text === null) return null
  return <div className="user-row sent"><div className="sent-label">发送后是普通消息</div><div className="user-bubble preline">{text}</div></div>
}

function VariantA(props: VariantProps) {
  return (
    <div className="variant variant-a">
      <div className="chat-scroll">
        <UserPrompt />
        <div className="source-stage">
          <AssistantSource
            annotations={props.annotations}
            active={props.active}
            onActivate={props.onActivate}
            onAddText={props.onAddText}
            onAddImagePin={props.onAddImagePin}
            onNote={props.onNote}
            onDelete={props.onDelete}
            variant="A"
          />
        </div>
        <SentBubble text={props.sent} />
      </div>
      <Composer {...props.composer} annotations={props.annotations} active={props.active} onActivate={props.onActivate} onDelete={props.onDelete} mode="ledger" />
    </div>
  )
}

function VariantB(props: VariantProps) {
  const activeItem = props.annotations.find(item => item.id === props.active) ?? props.annotations[0]
  const activeIndex = activeItem === undefined ? -1 : props.annotations.indexOf(activeItem)
  return (
    <div className="variant variant-b">
      <div className="workbench-main">
        <div className="chat-scroll">
          <UserPrompt />
          <AssistantSource
            annotations={props.annotations}
            active={props.active}
            onActivate={props.onActivate}
            onAddText={props.onAddText}
            onAddImagePin={props.onAddImagePin}
            onNote={props.onNote}
            onDelete={props.onDelete}
            variant="B"
          />
          <SentBubble text={props.sent} />
        </div>
        <Composer {...props.composer} annotations={props.annotations} active={props.active} onActivate={props.onActivate} onDelete={props.onDelete} mode="minimal" />
      </div>
      <aside className="review-panel">
        <div className="review-head"><div><span>审阅工作台</span><strong>{props.annotations.length} 条批示</strong></div><button onClick={props.composer.onDiscard}>清空</button></div>
        <div className="review-list">
          {props.annotations.map((item, index) => (
            <CompactCard
              key={item.id}
              item={item}
              index={index}
              active={item.id === activeItem?.id}
              onActivate={() => props.onActivate(item.id)}
              onDelete={() => props.onDelete(item.id)}
            />
          ))}
          {props.annotations.length === 0 && <div className="empty-review">选择回答文字或点击图片，开始批示。</div>}
        </div>
        {activeItem !== undefined && (
          <Editor
            item={activeItem}
            index={activeIndex}
            onNote={value => props.onNote(activeItem.id, value)}
            onDelete={() => props.onDelete(activeItem.id)}
          />
        )}
        <div className="review-foot"><span>按创建顺序发送</span><span>草稿已保存</span></div>
      </aside>
    </div>
  )
}

function MarginNote({ item, index, active, onActivate, onNote, onDelete }: {
  item: Annotation
  index: number
  active: boolean
  onActivate: () => void
  onNote: (value: string) => void
  onDelete: () => void
}) {
  return (
    <div className={`margin-note note-${item.id} ${active ? 'is-active' : ''}`} onClick={onActivate}>
      <div className="margin-line" />
      <div className="margin-head"><span>{index + 1}</span><AnnotationType item={item} /><button className="icon-button" onClick={(event) => { event.stopPropagation(); onDelete() }}><Icon name="close" /></button></div>
      <textarea value={item.note} placeholder="写下批语…" onChange={event => onNote(event.target.value)} />
      <small>{item.kind === 'text' ? `“${item.quote.slice(0, 24)}…”` : `${item.x}%, ${item.y}%`}</small>
    </div>
  )
}

function VariantC(props: VariantProps) {
  return (
    <div className="variant variant-c">
      <div className="chat-scroll margin-scroll">
        <UserPrompt />
        <div className="margin-stage">
          <AssistantSource
            annotations={props.annotations}
            active={props.active}
            onActivate={props.onActivate}
            onAddText={props.onAddText}
            onAddImagePin={props.onAddImagePin}
            onNote={props.onNote}
            onDelete={props.onDelete}
            variant="C"
          />
          <div className="margin-notes">
            {props.annotations.map((item, index) => (
              <MarginNote
                key={item.id}
                item={item}
                index={index}
                active={item.id === props.active}
                onActivate={() => props.onActivate(item.id)}
                onNote={value => props.onNote(item.id, value)}
                onDelete={() => props.onDelete(item.id)}
              />
            ))}
          </div>
        </div>
        <SentBubble text={props.sent} />
      </div>
      <Composer {...props.composer} annotations={props.annotations} active={props.active} onActivate={props.onActivate} onDelete={props.onDelete} mode="timeline" />
    </div>
  )
}

interface VariantProps {
  annotations: Annotation[]
  active: number | null
  sent: string | null
  onActivate: (id: number) => void
  onAddText: (quote: string) => number
  onAddImagePin: (x: number, y: number) => void
  onNote: (id: number, note: string) => void
  onDelete: (id: number) => void
  composer: {
    question: string
    onQuestion: (value: string) => void
    onDiscard: () => void
    onSend: () => void
  }
}

function PrototypeSwitcher({ variant, onVariant, onReset, state }: {
  variant: Variant
  onVariant: (variant: Variant) => void
  onReset: () => void
  state: unknown
}) {
  const [inspect, setInspect] = useState(false)
  const move = useCallback((delta: number) => {
    const index = VARIANTS.indexOf(variant)
    onVariant(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]!)
  }, [onVariant, variant])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])
  return (
    <>
      {inspect && <pre className="state-inspector">{JSON.stringify(state, null, 2)}</pre>}
      <div className="prototype-switcher">
        <span className="prototype-flag">PROTOTYPE</span>
        <button onClick={() => move(-1)} aria-label="上一个方案">←</button>
        <strong>{variant} — {VARIANT_NAMES[variant]}</strong>
        <button onClick={() => move(1)} aria-label="下一个方案">→</button>
        <span className="switcher-sep" />
        <button onClick={() => setInspect(value => !value)}>{inspect ? '收起状态' : '查看状态'}</button>
        <button onClick={onReset}>重置演示</button>
      </div>
    </>
  )
}

function App() {
  const [variant, setVariant] = useState(variantFromUrl)
  const [annotations, setAnnotations] = useState<Annotation[]>(INITIAL)
  const [active, setActive] = useState<number | null>(1)
  const [question, setQuestion] = useState('请按这些批示收紧方案，并说明取舍。')
  const [sent, setSent] = useState<string | null>(null)

  const selectVariant = (next: Variant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState({}, '', url)
    setVariant(next)
  }
  const activate = (id: number) => {
    setAnnotations((items) => {
      if (items.some(item => item.id === id)) return items
      const restored = INITIAL.find(item => item.id === id)
      return restored === undefined ? items : [...items, { ...restored }]
    })
    setActive(id)
  }
  const onNote = (id: number, note: string) => setAnnotations(items => items.map(item => item.id === id ? { ...item, note } : item))
  const addText = (quote: string) => {
    const id = Math.max(0, ...annotations.map(item => item.id)) + 1
    setAnnotations(items => [...items, { id, kind: 'text', quote, note: '' }])
    setActive(id)
    return id
  }
  const addImagePin = (x: number, y: number) => {
    const id = Math.max(0, ...annotations.map(item => item.id)) + 1
    setAnnotations(items => [...items, { id, kind: 'image', label: '模型设置截图', note: '', x, y }])
    setActive(id)
    return id
  }
  const onDelete = (id: number) => {
    setAnnotations(items => items.filter(item => item.id !== id))
    setActive(value => value === id ? null : value)
  }
  const reset = () => { setAnnotations(INITIAL.map(item => ({ ...item }))); setActive(1); setQuestion('请按这些批示收紧方案，并说明取舍。'); setSent(null) }
  const discard = () => { setAnnotations([]); setActive(null) }
  const send = () => {
    const lines = [question.trim(), ...annotations.map((item, index) => item.kind === 'text'
      ? `${index + 1}. 关于“${item.quote}”：${item.note || '请重点处理这处。'}`
      : `${index + 1}. 图片“${item.label}”在 (${item.x}%, ${item.y}%)：${item.note || '请重点处理这个位置。'}`)].filter(Boolean)
    setSent(lines.join('\n\n'))
    setAnnotations([])
    setActive(null)
    setQuestion('')
  }
  const props: VariantProps = {
    annotations,
    active,
    sent,
    onActivate: activate,
    onAddText: addText,
    onAddImagePin: addImagePin,
    onNote,
    onDelete,
    composer: { question, onQuestion: setQuestion, onDiscard: discard, onSend: send },
  }
  const state = useMemo(() => ({ variant, sessionId: 'prototype-session', question, annotations, active, sent }), [variant, question, annotations, active, sent])
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-column">
        <Header count={annotations.length} />
        {variant === 'A' ? <VariantA {...props} /> : variant === 'B' ? <VariantB {...props} /> : <VariantC {...props} />}
      </main>
      {import.meta.env.DEV && <PrototypeSwitcher variant={variant} onVariant={selectVariant} onReset={reset} state={state} />}
    </div>
  )
}

const root = document.getElementById('root')
if (root === null) throw new Error('annotation prototype: missing #root')
createRoot(root).render(<App />)

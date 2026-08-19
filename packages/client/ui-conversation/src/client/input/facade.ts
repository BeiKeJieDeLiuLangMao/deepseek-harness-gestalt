/**
 * SessionInput shell over the pure input machine: the sole machine caller
 * and effect executor. Owns the InputState store (machine state + the queue
 * overlay), the notice channel, and the submit transaction plumbing
 * (adjudicate via the session's InputTriggerController; claim.submit; default
 * sink). Package-private; the hub alone constructs it and wires the scoped
 * event listeners onto it.
 */
import type { ClientContext, ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ArbitrateKey, ArbitrateOutcome, CommandClaim, ConsumeTokenRequest, PickOutcome,
  ReferenceInsert, InputTriggerController, TokenSpan,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {
  DraftAttachmentId, EditRange, EditSelection, InputActions, InputEffect, InputNotice, InputState,
  PasteComponent, QueuedMessage, SessionInput, SubmitAttempt,
} from './contract.ts'
import type { InputSubmitMode } from '../contract/composer-submission.ts'
import { InputMachine } from './machine.ts'
import type {
  AnnotationCompilerLabels, DraftAnnotation, PersistedAnnotationDraft, TextAnchor, TextAnnotationId,
} from '../annotation/model.ts'
import {
  assembledRequestOverflows, compileAnnotationSubmission, TextAnnotationId as createTextAnnotationId,
} from '../annotation/model.ts'

/** One exact annotation snapshot whose object identity owns its settlement. */
export interface AnnotationSubmissionReservation {
  readonly restoreText: string
  readonly ids: readonly TextAnnotationId[]
}

/** Popup face the shell needs (dismissal only; typed structurally to avoid a value import). */
export interface PopupDismissFace {
  dismiss(): void
}

/**
 * Construction dependencies of one facade. The slash/popup faces are THUNKS: the
 * shell is created inside the sessions provide materialization (before the
 * scope record is queryable), where `slash.sessionOf`/`command.popupFor`
 * cannot resolve yet — resolution defers to first interactive use.
 */
export interface SessionInputDeps {
  /** Session-scope ctx handed to claim.submit transactions. */
  actx: ClientContext
  /** Enter adjudication face resolver; absent/undefined answer = every '/' line falls to the default sink. */
  inputTriggers?: (() => InputTriggerController | undefined) | undefined
  /** PopupSelect shell face resolver (dismissal on submit lock / escape). */
  popup?: (() => PopupDismissFace | undefined) | undefined
  /** Queue read face; overlaid onto InputState.queue (absent = empty). */
  queue?: ObservableSnapshot<readonly QueuedMessage[]> | undefined
  /**
   * Steer every still-pending queued message into the running turn, in FIFO
   * order (the empty-draft accelerated-Enter gesture); absent = unsupported.
   */
  steerQueue?: (() => void) | undefined
  /** The plain-message sink (send choreography / materialize fork — the hub owns it). */
  defaultSink(
    text: string,
    imageIds: readonly DraftAttachmentId[],
    mode: InputSubmitMode,
    annotationDraft?: AnnotationSubmissionReservation,
  ): void
  /** Localized ordinary-prose fragments for Annotation Submission (the hub always supplies them). */
  annotationLabels: AnnotationCompilerLabels
  /** Advertised occupancy when the selected model reports a context window. */
  contextCapacity?: () => { usedTokens: number; contextWindow: number } | undefined
}

/** Guard tier from the machine phase. */
function guardOf(phase: InputState['phase']): 'plain' | 'claimed' | 'frozen' {
  switch (phase) {
    case 'plain': return 'plain'
    case 'claimed': return 'claimed'
    default: return 'frozen' // adjudicating / submitting
  }
}

const EMPTY_QUEUE: readonly QueuedMessage[] = []

/**
 * Structural check for one rehydrated Annotation Draft. localStorage JSON is
 * a durable boundary: a value written by anything other than this store is
 * dropped whole instead of partially adopted.
 * @param value - parsed persisted value.
 * @returns whether the value is a well-formed Annotation Draft.
 */
function isPersistedAnnotationDraft(value: unknown): value is PersistedAnnotationDraft {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { annotations?: unknown; nextSeq?: unknown }
  if (!Array.isArray(candidate.annotations) || typeof candidate.nextSeq !== 'number') return false
  return candidate.annotations.every((item): item is DraftAnnotation => {
    if (typeof item !== 'object' || item === null) return false
    const annotation = item as Record<string, unknown>
    if (typeof annotation.id !== 'string' || typeof annotation.note !== 'string') return false
    if (annotation.kind === 'text') {
      return typeof annotation.anchor === 'object' && annotation.anchor !== null
        && typeof (annotation.anchor as Record<string, unknown>).sourceId === 'string'
        && typeof (annotation.anchor as Record<string, unknown>).quote === 'string'
        && typeof (annotation.anchor as Record<string, unknown>).prefix === 'string'
        && typeof (annotation.anchor as Record<string, unknown>).suffix === 'string'
    }
    if (annotation.kind === 'image-pin') {
      return typeof annotation.imageId === 'string' && typeof annotation.imageName === 'string'
        && (annotation.source === 'composer' || annotation.source === 'history')
        && typeof annotation.x === 'number' && typeof annotation.y === 'number'
        && annotation.x >= 0 && annotation.x <= 100 && annotation.y >= 0 && annotation.y <= 100
    }
    return false
  })
}

/** No-pipeline lexicon: zero text-ref decorations. */
const EMPTY_LEXICON: ReadonlyMap<'/' | '@', readonly string[]> = new Map()

/**
 * The per-session input facade: scoped-event application verbs +
 * setDraft/submit + the published InputState store.
 */
export class SessionInputShell implements SessionInput {
  /** Published machine state + queue overlay (the InputZone currency source). */
  readonly state: SnapshotStore<InputState>
  /** Latest surfaced notice (null after clear); the wiring renders it beside the error strip. */
  readonly notices: SnapshotStore<InputNotice | null> = createSnapshotStore<InputNotice | null>(null)
  /** The public provide-channel action face (one stable identity per session). */
  readonly actions: InputActions = {
    setDraft: (text) => { this.setDraft(text) },
    addImages: ids => this.addImages(ids),
    removeImage: (id) => { this.removeImage(id) },
    pruneImages: (ids) => { this.pruneImages(ids) },
    addTextAnnotation: (anchor, note) => this.addTextAnnotation(anchor, note),
    updateTextAnnotation: (id, note) => { this.updateTextAnnotation(id, note) },
    removeTextAnnotation: (id) => { this.removeTextAnnotation(id) },
    discardTextAnnotations: () => { this.discardTextAnnotations() },
    addImagePin: (imageId, imageName, x, y, note, source) => this.addImagePin(imageId, imageName, x, y, note, source),
    updateImagePin: (id, patch) => { this.updateImagePin(id, patch) },
    removeImagePin: (id) => { this.removeImagePin(id) },
    submit: () => { this.submit('queue') },
  }

  // Real wall clock: the typing-run merge window must actually expire in
  // production (the machine's no-clock default is a constant for pure tests).
  private readonly core = new InputMachine({ now: () => Date.now() })
  private noticeSeq = 0
  private lastDraft = ''
  private imageIds: readonly DraftAttachmentId[] = []
  private annotations: readonly DraftAnnotation[] = []
  private annotationSubmission: AnnotationSubmissionReservation | undefined
  private annotationSeq = 0
  private disposed = false
  /** Draft persistence mirror (chat store write; receives the clipboard projection, never raw placeholders). */
  private mirrorFn: ((text: string) => void) | undefined
  /** Annotation Draft persistence mirror (chat store write; null = no draft). */
  private annotationMirrorFn: ((draft: PersistedAnnotationDraft | null) => void) | undefined
  private lastAnnotations: readonly DraftAnnotation[] = []
  private lastAnnotationSeq = 0

  constructor(private readonly deps: SessionInputDeps) {
    this.state = createSnapshotStore<InputState>(this.compose())
    deps.queue?.subscribe(() => { this.publish() })
  }

  // ---- SessionInput face ----

  /**
   * Single draft write path (all mutation rides machine events).
   * @param text - the full next draft.
   * @param editRange - the DOM-observed edit shape, when the caller knows it
   * (narrows the machine's occurrence math; absent → diff scan).
   */
  setDraft(text: string, editRange?: EditRange): void {
    if (this.annotationSubmission !== undefined) return
    this.run(this.core.dispatch({ type: 'draft-changed', draft: text, ...(editRange !== undefined ? { editRange } : {}) }))
  }

  /** Append ordered image ids unless an admission transaction is locked. */
  addImages(ids: readonly DraftAttachmentId[]): boolean {
    if (this.snapshot.phase === 'adjudicating' || this.snapshot.phase === 'submitting') return false
    if (ids.length === 0) return true
    this.imageIds = [...this.imageIds, ...ids]
    this.publish()
    return true
  }

  /** Remove one image id from this draft. */
  removeImage(id: DraftAttachmentId): void {
    const next = this.imageIds.filter(candidate => candidate !== id)
    if (next.length === this.imageIds.length) return
    this.imageIds = next
    this.annotations = this.annotations.filter(item => item.kind !== 'image-pin' || item.imageId !== id)
    this.publish()
  }

  /**
   * Keep only image ids that still resolve in the browser attachment registry.
   * @param available - live registry ids.
   */
  pruneImages(available: readonly DraftAttachmentId[]): void {
    const keep = new Set(available)
    const next = this.imageIds.filter(id => keep.has(id))
    if (next.length === this.imageIds.length) return
    this.imageIds = next
    this.publish()
  }

  /**
   * Add one text annotation in creation order.
   * @param anchor - Quoted source reference.
   * @param note - Optional user-authored comment.
   * @returns The stable draft identity.
   */
  addTextAnnotation(anchor: TextAnchor, note: string): TextAnnotationId {
    this.annotationSeq += 1
    const id = createTextAnnotationId(`annotation-${this.annotationSeq}`)
    this.annotations = [...this.annotations, { id, kind: 'text', anchor, note }]
    this.publish()
    return id
  }

  /**
   * Edit one note while preserving annotation identity and order.
   * @param id - Annotation to edit.
   * @param note - Replacement comment.
   */
  updateTextAnnotation(id: TextAnnotationId, note: string): void {
    if (this.annotationSubmission !== undefined) return
    const next = this.annotations.map(item => item.id === id ? { ...item, note } : item)
    if (next.every((item, index) => item === this.annotations[index])) return
    this.annotations = next
    this.publish()
  }

  /**
   * Delete one unsent annotation.
   * @param id - Annotation to remove.
   */
  removeTextAnnotation(id: TextAnnotationId): void {
    if (this.annotationSubmission !== undefined) return
    const next = this.annotations.filter(item => item.id !== id)
    if (next.length === this.annotations.length) return
    this.annotations = next
    this.publish()
  }

  /**
   * Discard the complete Annotation Draft — every annotation and Draft Mark —
   * in one action; the persisted draft mirrors out as null. Refused while a
   * submission holds a reservation.
   */
  discardTextAnnotations(): void {
    if (this.annotationSubmission !== undefined || this.annotations.length === 0) return
    this.annotations = []
    this.publish()
  }

  /**
   * Add one image pin in the shared creation order.
   * @param imageId - Staged Composer image id.
   * @param imageName - Display name used in compiled prose.
   * @param x - Displayed-raster X percent.
   * @param y - Displayed-raster Y percent.
   * @param note - Optional user-authored comment.
   * @param source - Composer-staged image or durable history attachment.
   * @returns The stable draft identity.
   */
  addImagePin(
    imageId: DraftAttachmentId,
    imageName: string,
    x: number,
    y: number,
    note: string,
    source: 'composer' | 'history' = 'composer',
  ): TextAnnotationId {
    this.annotationSeq += 1
    const id = createTextAnnotationId(`annotation-${this.annotationSeq}`)
    this.annotations = [...this.annotations, { id, kind: 'image-pin', imageId, source, imageName, x, y, note }]
    this.publish()
    return id
  }

  /**
   * Edit one pin's note or position while preserving identity and order.
   * @param id - Pin to edit.
   * @param patch - Replacement fields.
   */
  updateImagePin(id: TextAnnotationId, patch: { note?: string; x?: number; y?: number }): void {
    if (this.annotationSubmission !== undefined) return
    const next = this.annotations.map((item) => {
      if (item.id !== id || item.kind !== 'image-pin') return item
      return {
        ...item,
        note: patch.note ?? item.note,
        x: patch.x ?? item.x,
        y: patch.y ?? item.y,
      }
    })
    if (next.every((item, index) => item === this.annotations[index])) return
    this.annotations = next
    this.publish()
  }

  /**
   * Delete one unsent image pin.
   * @param id - Pin to remove.
   */
  removeImagePin(id: TextAnnotationId): void {
    this.removeTextAnnotation(id)
  }

  /**
   * Settle the owned annotation snapshot after Host admission.
   * @param reservation - Exact object handed to the sink.
   * @param admitted - Whether the Host accepted the compiled message.
   */
  settleAnnotationSubmission(reservation: AnnotationSubmissionReservation, admitted: boolean): void {
    if (this.annotationSubmission !== reservation) return
    this.annotationSubmission = undefined
    if (admitted) {
      const submitted = new Set(reservation.ids)
      this.annotations = this.annotations.filter(item => !submitted.has(item.id))
    }
    this.publish()
  }

  /**
   * Restore a failed attempt before any images added after its admission.
   * @param ids - failed attempt image ids.
   */
  restoreImages(ids: readonly DraftAttachmentId[]): void {
    const current = new Set(this.imageIds)
    this.imageIds = [...ids.filter(id => !current.has(id)), ...this.imageIds]
    this.publish()
  }

  /**
   * Clear the draft as a successful-send commit: no undo unit is recorded and
   * the undo history is cut, so Ctrl/Cmd-Z cannot resurrect sent content
   * (the command path gets the same discipline from submit-settled success).
   * @param imageIds - admitted image ids to remove from this draft.
   */
  commitSend(imageIds: readonly DraftAttachmentId[]): void {
    const submitted = new Set(imageIds)
    this.imageIds = this.imageIds.filter(id => !submitted.has(id))
    this.run(this.core.dispatch({ type: 'send-committed' }))
  }

  /** Undo the latest transaction (InputBar intercepts the platform chord). */
  undo(): void {
    this.run(this.core.dispatch({ type: 'undo' }))
  }

  /** Redo the latest undone transaction. */
  redo(): void {
    this.run(this.core.dispatch({ type: 'redo' }))
  }

  /**
   * Paste text over the selection in one transaction, with any hot-snapshot
   * sync matches componentized inside it.
   * @param text - pasted plain text.
   * @param selection - replaced selection in draft coordinates.
   * @param components - sync-matched reference components (disjoint, inside `text`).
   * @param generation - projection generation for late async-upgrade guards.
   */
  transformPaste(text: string): string {
    return this.deps.inputTriggers?.()?.transformPaste(text) ?? text
  }

  pasteBegin(text: string, selection: EditSelection, components?: readonly PasteComponent[], generation?: number): void {
    this.run(this.core.dispatch({
      type: 'paste-begin', text, selection,
      ...(components !== undefined ? { components } : {}),
      ...(generation !== undefined ? { generation } : {}),
    }))
  }

  /** End the live paste-match attempt (caret/selection ops and Slash updates the machine cannot see). */
  invalidatePaste(): void {
    this.run(this.core.dispatch({ type: 'invalidate-paste' }))
  }

  /**
   * Enter adjudication + submit transaction + default sink. Effects fan out
   * from the machine; this method only feeds the event. Lock entry
   * (adjudicating/submitting) force-closes the transient layers: the popup
   * dismisses and the menu tracks frozen.
   */
  submit(mode: InputSubmitMode = 'queue'): void {
    if (this.annotationSubmission !== undefined) return
    if (this.snapshot.draft.trim() === '' && (this.imageIds.length > 0 || this.annotations.length > 0)) {
      if (this.snapshot.phase === 'plain') this.sinkSerialized('', mode)
      return
    }
    this.run(this.core.dispatch({ type: 'enter', mode }))
    const phase = this.snapshot.phase
    if (phase === 'adjudicating' || phase === 'submitting') {
      this.deps.popup?.()?.dismiss()
      this.deps.inputTriggers?.()?.track(this.snapshot.draft, 0, { tier: 'frozen' }, this.snapshot.draftRev)
    }
  }

  /**
   * Feed a draft/caret change through trigger detection (guard derived from
   * the machine phase).
   * @param draft - live draft text.
   * @param caret - caret position in draft coordinates.
   */
  track(draft: string, caret: number): void {
    this.deps.inputTriggers?.()?.track(draft, caret, { tier: guardOf(this.snapshot.phase) }, this.snapshot.draftRev)
  }

  /**
   * Keyboard arbitration while the menu is open.
   * @param key - the intercepted key.
   * @param composing - IME composition guard state.
   * @returns the menu's verdict; 'pass' when no pipeline is mounted.
   */
  arbitrate(key: ArbitrateKey, composing: boolean): ArbitrateOutcome {
    return this.deps.inputTriggers?.()?.arbitrate(key, composing) ?? 'pass'
  }

  /**
   * Steer every still-pending queued message into the running turn (the
   * empty-draft accelerated-Enter gesture). Execution belongs to the hub's
   * queue choreography; absent dep = the gesture falls back to the machine's
   * empty-draft no-op.
   */
  steerQueue(): void {
    this.deps.steerQueue?.()
  }

  /**
   * Space adjudication over the controller's hot state.
   * @returns true = a claim/insert was applied — the caller preventDefaults.
   */
  space(): boolean {
    const inputTriggers = this.deps.inputTriggers?.()
    if (inputTriggers === undefined) return false
    const consumed = inputTriggers.onSpace()
    // Machine-driven draft replacement never passes through onChange, so
    // re-track: the caret lands after the token, where detection sees
    // whitespace and closes the menu.
    if (consumed) {
      const next = this.snapshot
      inputTriggers.track(next.draft, next.draft.length, { tier: guardOf(next.phase) }, next.draftRev)
    }
    return consumed
  }

  /** Dismiss the popupSelect shell (any interaction outside the box). */
  dismissPopup(): void {
    this.deps.popup?.()?.dismiss()
  }

  /**
   * Hot plain-text reference lexicon source for the decoration scan
   * (the plain-text-reference decision;
   * see .agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md):
   * delegates to the controller's aggregated store. Stable
   * identity per shell; without a pipeline the snapshot is the empty Map and
   * subscribers never fire.
   */
  readonly lexicon: ObservableSnapshot<ReadonlyMap<'/' | '@', readonly string[]>> = {
    getSnapshot: () => this.deps.inputTriggers?.()?.lexicon.getSnapshot() ?? EMPTY_LEXICON,
    subscribe: fn => this.deps.inputTriggers?.()?.lexicon.subscribe(fn) ?? (() => {}),
  }

  /**
   * Apply one command claim (scoped begin-command event listener body).
   * @param claim - the command claim from the pick path.
   * @param span - pick-time span snapshot.
   * @returns whether the machine accepted (phase + span CAS passed and the draft mutated).
   */
  beginCommand(claim: CommandClaim, span: TokenSpan): boolean {
    const before = this.core.state.draftRev
    this.run(this.core.dispatch({ type: 'begin-command', claim, span }))
    return this.core.state.phase === 'claimed' && this.core.state.draftRev !== before
  }

  /**
   * Apply one reference insertion (scoped insert-reference event listener body).
   * @param ref - the reference insertion from the pick path.
   * @param span - pick-time span snapshot.
   * @returns whether the machine accepted.
   */
  insertReference(ref: ReferenceInsert, span: TokenSpan): boolean {
    const before = this.core.state.draftRev
    this.run(this.core.dispatch({ type: 'insert-ref', reference: ref, span }))
    return this.core.state.draftRev !== before
  }

  /**
   * Consume one command token after business success (scoped consume-token
   * event listener body). Span guard: revision CAS then splice; bare-token
   * guard: trimmed-draft equality then clear.
   * @param guard - exact span or bare-token guard.
   * @returns whether the token was consumed.
   */
  consumeToken(guard: ConsumeTokenRequest['guard']): boolean {
    const snapshot = this.core.state
    if (guard.kind === 'span') {
      if (guard.span.draftRev !== snapshot.draftRev) return false
      const draft = snapshot.draft
      this.setDraft(draft.slice(0, guard.span.start) + draft.slice(guard.span.end))
      return true
    }
    if (snapshot.draft.trim() !== guard.token) return false
    this.setDraft('')
    return true
  }

  /**
   * Insert plain reference text over the pick-time span (scoped insert-text
   * event listener body; plain-text-reference decision, web-input-machine
   * note). Same CAS-then-splice shape as the
   * consume-token span branch: the machine sees an ordinary draft-changed
   * transaction (one undo step), no occurrence is minted — the chip look is
   * a scan-derived decoration, never state.
   * @param text - the plain reference text to splice in (e.g. `/name `).
   * @param span - pick-time span snapshot (draftRev CAS).
   * @returns whether the text was applied.
   */
  insertText(text: string, span: TokenSpan): boolean {
    const snapshot = this.core.state
    if (span.draftRev !== snapshot.draftRev) return false
    const draft = snapshot.draft
    this.setDraft(draft.slice(0, span.start) + text + draft.slice(span.end))
    return true
  }

  /**
   * Surface a notice from outside the machine (detached command results).
   * @param level - severity tier.
   * @param text - notice body.
   */
  notify(level: 'info' | 'error', text: string): void {
    this.noticeSeq += 1
    this.notices.set({ level, text, seq: this.noticeSeq })
  }

  // ---- wiring-layer extras (not on the frozen SessionInput face) ----

  /** Teardown: abort any in-flight attempt and stop accepting async settlements. */
  dispose(): void {
    this.disposed = true
    this.run(this.core.dispatch({ type: 'release' }))
  }

  /** Read the live machine state (guard derivation reads here). */
  get snapshot(): InputState {
    return this.state.getSnapshot()
  }

  /**
   * Bind the draft persistence mirror (chat store write). Adopt-on-bind: the
   * store draft may hold a persisted value from a previous mount; the caller
   * seeds it via setDraft BEFORE binding, and afterwards every machine-adopted
   * draft mirrors out.
   * @param write - store draft write.
   * @returns the unbind disposer.
   */
  bindMirror(write: (text: string) => void): () => void {
    this.mirrorFn = write
    return () => {
      if (this.mirrorFn === write) this.mirrorFn = undefined
    }
  }

  /**
   * Bind the Annotation Draft persistence mirror (chat store write). Every
   * published annotation mutation mirrors out as one whole value; an emptied
   * draft mirrors as null.
   * @param write - store annotation-draft write.
   * @returns the unbind disposer.
   */
  bindAnnotationMirror(write: (draft: PersistedAnnotationDraft | null) => void): () => void {
    this.annotationMirrorFn = write
    return () => {
      if (this.annotationMirrorFn === write) this.annotationMirrorFn = undefined
    }
  }

  /**
   * Adopt a persisted Annotation Draft wholesale (remount/reload seeding).
   * Ignored while annotations already exist or a submission is in flight, so
   * a late restore can never clobber live or reserved state; malformed
   * persisted values are dropped rather than adopted.
   * @param persisted - rehydrated store value.
   */
  restoreAnnotationDraft(persisted: PersistedAnnotationDraft): void {
    if (this.annotations.length > 0 || this.annotationSubmission !== undefined) return
    if (!isPersistedAnnotationDraft(persisted)) return
    this.annotations = persisted.annotations
    this.annotationSeq = Math.max(this.annotationSeq, persisted.nextSeq - 1, 0)
    this.publish()
  }

  // ---- effect executor ----

  private run(effects: readonly InputEffect[]): void {
    for (const fx of effects) this.execute(fx)
    this.publish()
  }

  private execute(fx: InputEffect): void {
    switch (fx.type) {
      case 'notice': {
        this.noticeSeq += 1
        this.notices.set({ level: fx.level, text: fx.text, seq: this.noticeSeq })
        return
      }
      case 'adjudicate': {
        this.adjudicate(fx.attempt, fx.draft)
        return
      }
      case 'begin-submit': {
        this.beginSubmit(fx.attempt, fx.claim, fx.args)
        return
      }
      case 'default-sink': {
        this.sinkSerialized(fx.draft, fx.mode)
        return
      }
      default:
        return // machine-internal effects (mirror rides publish)
    }
  }

  /**
   * Prompt serialization before the sink: expand each
   * placeholder to its owner's model form via the session controller's
   * codec routing. Owner missing / serialize failure / disposal blocks the
   * send — notice + draft and chips retained, never a silent downgrade to
   * the clipboard text. Chip-free drafts skip the async detour.
   */
  private sinkSerialized(draft: string, mode: InputSubmitMode): void {
    const imageIds = [...this.imageIds]
    const annotations = [...this.annotations]
    const annotationDraft = annotations.length === 0
      ? undefined
      : { restoreText: draft, ids: annotations.map(item => item.id) }
    if (annotationDraft !== undefined) {
      this.annotationSubmission = annotationDraft
      this.publish()
    }
    const occurrences = this.core.state.occurrences
    if (occurrences.length === 0) {
      const compiled = this.compile(draft, annotations)
      if (this.rejectKnownOverflow(compiled, annotationDraft)) return
      if (annotationDraft === undefined) this.deps.defaultSink(compiled, imageIds, mode)
      else this.deps.defaultSink(compiled, imageIds, mode, annotationDraft)
      return
    }
    const inputTriggers = this.deps.inputTriggers?.()
    const controller = new AbortController()
    void Promise.all(occurrences.map(async (o) => {
      if (inputTriggers === undefined) throw new Error(`no serializer for reference source "${o.source}"`)
      return { offset: o.offset, text: await inputTriggers.serializeReference(o.source, o.ref, controller.signal) }
    })).then(
      (parts) => {
        if (this.disposed) return
        // Splice model forms over their placeholders (offsets are draft-time;
        // parts arrive offset-sorted since the table is).
        let out = ''
        let cursor = 0
        for (const part of parts) {
          out += draft.slice(cursor, part.offset) + part.text
          cursor = part.offset + 1
        }
        out += draft.slice(cursor)
        const compiled = this.compile(out, annotations)
        if (annotationDraft === undefined) this.deps.defaultSink(compiled, imageIds, mode)
        else this.deps.defaultSink(compiled, imageIds, mode, annotationDraft)
      },
      (error: unknown) => {
        controller.abort()
        if (this.disposed) return
        if (annotationDraft !== undefined) this.settleAnnotationSubmission(annotationDraft, false)
        const message = error instanceof Error ? error.message : String(error)
        this.notify('error', message)
      },
    )
  }

  /** Enter adjudication: poll the session controller; failure = notice + draft retained (never a silent downgrade). */
  private adjudicate(attempt: SubmitAttempt, draft: string): void {
    const inputTriggers = this.deps.inputTriggers?.()
    if (inputTriggers === undefined) {
      // No pipeline mounted: the '/' line is an ordinary message.
      this.run(this.core.dispatch({ type: 'adjudicated', attempt, outcome: undefined }))
      return
    }
    inputTriggers.adjudicate(draft.trim(), attempt.signal).then(
      (outcome: PickOutcome) => {
        if (this.dead(attempt)) return
        this.run(this.core.dispatch({ type: 'adjudicated', attempt, outcome }))
      },
      (error: unknown) => {
        if (this.dead(attempt)) return
        const message = error instanceof Error ? error.message : String(error)
        this.run(this.core.dispatch({ type: 'adjudication-failed', attempt, message }))
      },
    )
  }

  /** The submit transaction: claim.submit against the session scope; ok maps from the outcome kind. */
  private beginSubmit(attempt: SubmitAttempt, claim: CommandClaim, args: string): void {
    Promise.resolve()
      .then(() => claim.submit(args, this.deps.actx))
      .then(
        (outcome) => {
          if (this.dead(attempt)) return
          this.run(this.core.dispatch({
            type: 'submit-settled', attempt, ok: outcome.kind === 'success', outcome,
          }))
        },
        (error: unknown) => {
          if (this.dead(attempt)) return
          const message = error instanceof Error ? error.message : String(error)
          this.run(this.core.dispatch({ type: 'submit-settled', attempt, ok: false, message }))
        },
      )
  }

  /** Late-settlement guard: superseded attempts and disposed facades drop silently. */
  private dead(attempt: SubmitAttempt): boolean {
    return this.disposed || attempt.signal.aborted
  }

  private compose(): InputState {
    const core = this.core.state
    return {
      ...core,
      imageIds: this.imageIds,
      annotations: this.annotations,
      annotationSubmitting: this.annotationSubmission !== undefined,
      queue: this.deps.queue?.getSnapshot() ?? EMPTY_QUEUE,
    }
  }

  private compile(question: string, annotations: readonly DraftAnnotation[]): string {
    return compileAnnotationSubmission(question, annotations, this.deps.annotationLabels)
  }

  /**
   * Reject a known overflow before the sink. Unknown capacity is not this path.
   * @param compiled - assembled request text.
   * @param annotationDraft - in-flight reservation to release on overflow.
   * @returns whether the request must not be sent.
   */
  private rejectKnownOverflow(
    compiled: string,
    annotationDraft: AnnotationSubmissionReservation | undefined,
  ): boolean {
    const capacity = this.deps.contextCapacity?.()
    if (capacity === undefined) return false
    if (!assembledRequestOverflows(compiled.length, capacity.usedTokens, capacity.contextWindow)) return false
    if (annotationDraft !== undefined) this.settleAnnotationSubmission(annotationDraft, false)
    this.notify('error', this.deps.annotationLabels.overflow)
    return true
  }

  private publish(): void {
    const next = this.compose()
    this.state.set(next)
    if (next.draft !== this.lastDraft) {
      this.lastDraft = next.draft
      this.mirrorFn?.(next.draft)
    }
    if (this.annotations !== this.lastAnnotations || this.annotationSeq !== this.lastAnnotationSeq) {
      this.lastAnnotations = this.annotations
      this.lastAnnotationSeq = this.annotationSeq
      this.annotationMirrorFn?.(
        this.annotations.length === 0
          ? null
          : { annotations: this.annotations, nextSeq: this.annotationSeq + 1 },
      )
    }
  }
}

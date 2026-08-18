/** Draft-only text annotation vocabulary and ordinary-message compiler. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Browser-runtime identity of one unsent text annotation. */
export type TextAnnotationId = Branded<'TextAnnotationId'>

/**
 * Brand a machine-minted annotation id.
 * @param id - Raw browser-runtime id.
 * @returns The same string with its annotation brand.
 */
export function TextAnnotationId(id: string): TextAnnotationId {
  return id as TextAnnotationId
}

/** Resilient reference to renderer-owned source text from one completed assistant message. */
export interface TextAnchor {
  readonly sourceId: string
  readonly quote: string
  readonly prefix: string
  readonly suffix: string
}

/** One unsent text annotation. */
export interface TextAnnotation {
  readonly id: TextAnnotationId
  readonly kind: 'text'
  readonly anchor: TextAnchor
  readonly note: string
}

/**
 * JSON-persisted whole value of one Session's Annotation Draft. `annotations`
 * keeps creation order and identities; `nextSeq` continues the owner's id
 * sequence so a restored draft never reuses a live identity.
 */
export interface PersistedAnnotationDraft {
  readonly annotations: readonly TextAnnotation[]
  readonly nextSeq: number
}

/** Locale-owned prose fragments used by the deterministic compiler. */
export interface AnnotationCompilerLabels {
  /** @returns A localized heading for the one-based annotation index. */
  heading: (index: number) => string
  /** @returns A localized exact-quotation paragraph. */
  quote: (value: string) => string
  /** @returns A localized non-empty note paragraph. */
  note: (value: string) => string
}

const CONTEXT_LENGTH = 48

/**
 * Capture a quotation and nearby source text without retaining renderer nodes.
 * @param sourceId - Stable assistant-message identity.
 * @param source - Renderer-owned source-text projection of that message block.
 * @param quote - Exact selected quotation.
 * @param start - Quotation start in `source`.
 * @returns The durable-in-draft text anchor.
 */
export function createTextAnchor(sourceId: string, source: string, quote: string, start: number): TextAnchor {
  if (quote === '' || start < 0 || source.slice(start, start + quote.length) !== quote) {
    throw new Error('text annotation selection does not match its source')
  }
  return {
    sourceId,
    quote,
    prefix: source.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: source.slice(start + quote.length, start + quote.length + CONTEXT_LENGTH),
  }
}

/**
 * Compile unsent annotations into the ordinary user-message text.
 * @param question - Composer question, kept first when present.
 * @param annotations - Annotation creation order.
 * @param labels - Locale-owned readable prose fragments.
 * @returns Plain localized prose with no annotation protocol.
 */
export function compileAnnotationSubmission(
  question: string,
  annotations: readonly TextAnnotation[],
  labels: AnnotationCompilerLabels,
): string {
  const paragraphs = annotations.map((annotation, index) => [
    labels.heading(index + 1),
    labels.quote(annotation.anchor.quote),
    ...(annotation.note === '' ? [] : [labels.note(annotation.note)]),
  ].join('\n'))
  const prompt = question.trim()
  return [...(prompt === '' ? [] : [prompt]), ...paragraphs].join('\n\n')
}

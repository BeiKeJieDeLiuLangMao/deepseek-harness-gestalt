import type { CSSProperties, Key, MutableRefObject, ReactNode, RefCallback } from 'react'

/** Selection details projected from renderer-owned Markdown registrations. */
export interface MarkdownSelection {
  /** Visible selected text. */
  quote: string
  /** Renderer-owned text projection containing the selection. */
  projection: string
  /** Exact selection start in {@link projection}. */
  start: number
}

/** Text Anchor fields used to resolve one renderer-owned text range. */
export interface MarkdownTextAnchor {
  /** Exact selected quotation. */
  quote: string
  /** Bounded text immediately before the quotation. */
  prefix: string
  /** Bounded text immediately after the quotation. */
  suffix: string
}

/** One visible source-text run owned by a replaceable renderer contribution. */
export interface MarkdownTextRun {
  /** Visible source text. */
  value: string
  /** React key within the contribution. */
  key: Key
  /** Optional syntax-highlighting style. */
  style?: CSSProperties | undefined
}

/** Stable source-order contribution whose rendered runs may change across local rerenders. */
export interface MarkdownTextContribution {
  /**
   * Replace the contribution's visible runs and return their registered spans.
   * @param runs - Current visible runs in source order.
   * @returns Registered spans in the same order.
   */
  render(runs: readonly MarkdownTextRun[]): ReactNode[]
}

/**
 * Renderer-owned mapping between selectable Markdown leaves and DOM Ranges.
 * Consumers inspect registered endpoints; they never reconstruct the rendered DOM.
 */
export interface MarkdownSelectionMap {
  /**
   * Inspect one DOM selection.
   * @param range - Noncollapsed selection range inside the rendered Markdown.
   * @returns Selected text and its exact renderer projection, or null when an image or unregistered leaf is included.
   */
  inspect(range: Range): MarkdownSelection | null
  /**
   * Rebuild a range for an anchored quotation.
   * @param anchor - Exact quotation and surrounding renderer-projection context.
   * @returns A range over registered text leaves, or null when the quotation is not selectable.
   */
  rangeForText(anchor: MarkdownTextAnchor): Range | null
}

/** Mutable ref shared by the Markdown renderer and its selection owner. */
export type MarkdownSelectionMapRef = MutableRefObject<MarkdownSelectionMap | null>

interface TextLeaf {
  readonly value: string
  node: Node | null
}

interface TextBoundary {
  readonly node: Node
  readonly offset: number
}

class TextContribution implements MarkdownTextContribution {
  private leaves: readonly TextLeaf[] = []

  render(runs: readonly MarkdownTextRun[]): ReactNode[] {
    const entries = runs.map((run) => {
      const leaf: TextLeaf = { value: run.value, node: null }
      return { run, leaf }
    })
    const leaves = entries.map(entry => entry.leaf)
    return entries.map(({ run, leaf }) => {
      const register: RefCallback<HTMLSpanElement> = (element) => {
        leaf.node = element?.childNodes.item(0) ?? null
        if (element !== null) this.leaves = leaves
      }
      return <span key={run.key} ref={register} style={run.style}>{run.value}</span>
    })
  }

  /** Current committed runs; null refs retain text but remove mounted endpoints. */
  currentLeaves(): readonly TextLeaf[] {
    return this.leaves
  }
}

class ImageContribution {
  node: HTMLImageElement | null = null

  constructor(readonly alt: string) {}

  readonly register: RefCallback<HTMLImageElement> = (element) => {
    this.node = element
  }
}

type Contribution = TextContribution | ImageContribution

/** One settled render's source-ordered registration collector and selection mapping. */
export class MarkdownSelectionCollector implements MarkdownSelectionMap {
  private readonly contributions: Contribution[] = []

  /** Allocate a stable contribution at the renderer's current source-order position. */
  createTextContribution(): MarkdownTextContribution {
    const contribution = new TextContribution()
    this.contributions.push(contribution)
    return contribution
  }

  /** Render and register one text leaf at the renderer's current source-order position. */
  renderText(value: string, key: Key, style?: CSSProperties): ReactNode {
    return this.createTextContribution().render([{ value, key, style }])[0]
  }

  /** Reserve an image's plain-text alt span and return its mounted-node registration. */
  registerImage(alt: string): RefCallback<HTMLImageElement> {
    const contribution = new ImageContribution(alt)
    this.contributions.push(contribution)
    return contribution.register
  }

  inspect(range: Range): MarkdownSelection | null {
    const start = this.offsetForEndpoint(range.startContainer, range.startOffset)
    const end = this.offsetForEndpoint(range.endContainer, range.endOffset)
    if (start === null || end === null) return null
    for (const contribution of this.contributions) {
      if (contribution instanceof ImageContribution
        && contribution.node !== null
        && range.intersectsNode(contribution.node)) return null
    }
    const projection = this.projection()
    const quote = range.toString()
    if (projection.slice(start, end) !== quote) return null
    return { quote, projection, start }
  }

  rangeForText(anchor: MarkdownTextAnchor): Range | null {
    const projection = this.projection()
    const needle = anchor.prefix + anchor.quote + anchor.suffix
    const match = projection.indexOf(needle)
    if (match < 0 || projection.indexOf(needle, match + 1) >= 0) return null
    const start = match + anchor.prefix.length
    const end = start + anchor.quote.length
    let cursor = 0
    for (const contribution of this.contributions) {
      const length = contribution instanceof TextContribution
        ? contribution.currentLeaves().reduce((total, leaf) => total + leaf.value.length, 0)
        : contribution.alt.length
      if (contribution instanceof ImageContribution) {
        const crosses = length === 0
          ? start < cursor && cursor < end
          : start < cursor + length && cursor < end
        if (crosses) return null
      }
      cursor += length
    }
    const startBoundary = this.boundaryAt(start, 'start')
    const endBoundary = this.boundaryAt(end, 'end')
    if (startBoundary === null || endBoundary === null) return null
    const range = document.createRange()
    range.setStart(startBoundary.node, startBoundary.offset)
    range.setEnd(endBoundary.node, endBoundary.offset)
    return range
  }

  private projection(): string {
    let projection = ''
    for (const contribution of this.contributions) {
      projection += contribution instanceof TextContribution
        ? contribution.currentLeaves().map(leaf => leaf.value).join('')
        : contribution.alt
    }
    return projection
  }

  private boundaryAt(offset: number, edge: 'start' | 'end'): TextBoundary | null {
    let cursor = 0
    for (const contribution of this.contributions) {
      if (contribution instanceof ImageContribution) {
        cursor += contribution.alt.length
        continue
      }
      for (const leaf of contribution.currentLeaves()) {
        const end = cursor + leaf.value.length
        const contains = edge === 'start'
          ? cursor <= offset && offset < end
          : cursor < offset && offset <= end
        if (contains) return leaf.node === null ? null : { node: leaf.node, offset: offset - cursor }
        cursor = end
      }
    }
    /* v8 ignore next -- nonempty Text Anchors that resolve inside the projection
       return from one registered leaf; null-node disposal returns above. */
    return null
  }

  private offsetForEndpoint(container: Node, offset: number): number | null {
    let cursor = 0
    for (const contribution of this.contributions) {
      if (contribution instanceof ImageContribution) {
        cursor += contribution.alt.length
        continue
      }
      for (const leaf of contribution.currentLeaves()) {
        const node = leaf.node
        if (node !== null) {
          if (container === node) return cursor + Math.min(offset, leaf.value.length)
          if (container === node.parentNode) return cursor + (offset === 0 ? 0 : leaf.value.length)
        }
        cursor += leaf.value.length
      }
    }
    return null
  }
}

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
  readonly start: number
  readonly value: string
}

interface ImageLeaf {
  readonly start: number
  readonly end: number
}

interface TextBoundary {
  readonly node: Node
  readonly offset: number
}

/** One settled render's registration collector and selection mapping. */
export class MarkdownSelectionCollector implements MarkdownSelectionMap {
  private cursor = 0
  private text = ''
  private readonly textLeaves: TextLeaf[] = []
  private readonly imageLeaves: ImageLeaf[] = []
  private readonly mountedImages = new Set<HTMLImageElement>()
  private readonly startBoundaries: TextBoundary[] = []
  private readonly endBoundaries: TextBoundary[] = []

  /** Render and register one text leaf without inspecting the mounted DOM. */
  renderText(value: string, key: Key, style?: CSSProperties): ReactNode {
    const leaf: TextLeaf = { start: this.cursor, value }
    this.cursor += value.length
    this.text += value
    this.textLeaves.push(leaf)
    const register: RefCallback<HTMLSpanElement> = (element) => {
      if (element === null) return
      const node = element.childNodes.item(0)
      for (let offset = 0; offset < value.length; offset += 1) {
        this.startBoundaries[leaf.start + offset] = { node, offset }
        this.endBoundaries[leaf.start + offset + 1] = { node, offset: offset + 1 }
      }
    }
    return <span key={key} ref={register} style={style}>{value}</span>
  }

  /** Reserve an image's plain-text alt span and return its DOM registration. */
  registerImage(alt: string): RefCallback<HTMLImageElement> {
    const leaf: ImageLeaf = { start: this.cursor, end: this.cursor + alt.length }
    this.cursor += alt.length
    this.text += alt
    this.imageLeaves.push(leaf)
    let mounted: HTMLImageElement
    return (element) => {
      if (element === null) {
        this.mountedImages.delete(mounted)
        return
      }
      mounted = element
      this.mountedImages.add(element)
    }
  }

  inspect(range: Range): MarkdownSelection | null {
    const start = this.offsetForEndpoint(range.startContainer, range.startOffset)
    const end = this.offsetForEndpoint(range.endContainer, range.endOffset)
    if (start === null || end === null) return null
    for (const element of this.mountedImages) {
      if (range.intersectsNode(element)) return null
    }
    const quote = range.toString()
    if (this.text.slice(start, end) !== quote) return null
    return { quote, projection: this.text, start }
  }

  rangeForText(anchor: MarkdownTextAnchor): Range | null {
    const needle = anchor.prefix + anchor.quote + anchor.suffix
    const match = this.text.indexOf(needle)
    if (match < 0 || this.text.indexOf(needle, match + 1) >= 0) return null
    const start = match + anchor.prefix.length
    const end = start + anchor.quote.length
    for (const image of this.imageLeaves) {
      const crosses = image.start === image.end
        ? start < image.start && image.end < end
        : start < image.end && image.start < end
      if (crosses) return null
    }
    // A nonempty quotation in the text projection that excludes images has registered text on both boundaries.
    const startLeaf = this.startBoundaries[start] as TextBoundary
    const endLeaf = this.endBoundaries[end] as TextBoundary
    const range = document.createRange()
    range.setStart(startLeaf.node, startLeaf.offset)
    range.setEnd(endLeaf.node, endLeaf.offset)
    return range
  }

  private offsetForEndpoint(container: Node, offset: number): number | null {
    for (const leaf of this.textLeaves) {
      const element = this.startBoundaries[leaf.start]?.node.parentNode
      const node = this.startBoundaries[leaf.start]?.node
      if (container === node) return leaf.start + Math.min(offset, leaf.value.length)
      if (container === element) return leaf.start + (offset === 0 ? 0 : leaf.value.length)
    }
    return null
  }
}

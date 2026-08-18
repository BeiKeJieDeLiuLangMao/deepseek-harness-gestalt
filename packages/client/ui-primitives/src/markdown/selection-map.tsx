import type { Key, MutableRefObject, ReactNode, RefCallback } from 'react'

/** Selection details projected from renderer-owned Markdown registrations. */
export interface MarkdownSelection {
  /** Visible selected text. */
  quote: string
  /** Approximate rendered-text offset used to disambiguate repeated quotations. */
  approximate: number
}

/**
 * Renderer-owned mapping between selectable Markdown leaves and DOM Ranges.
 * Consumers inspect registered endpoints; they never reconstruct the rendered DOM.
 */
export interface MarkdownSelectionMap {
  /**
   * Inspect one DOM selection.
   * @param range - Noncollapsed selection range inside the rendered Markdown.
   * @returns Selected text and its approximate offset, or null when an image or unregistered leaf is included.
   */
  inspect(range: Range): MarkdownSelection | null
  /**
   * Rebuild a range for an anchored quotation.
   * @param quote - Exact selected quotation.
   * @param approximate - Preferred occurrence offset in the plain-text projection.
   * @returns A range over registered text leaves, or null when the quotation is not selectable.
   */
  rangeForText(quote: string, approximate: number): Range | null
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
  renderText(value: string, key: Key): ReactNode {
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
    return <span key={key} ref={register}>{value}</span>
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
    const approximate = this.offsetForEndpoint(range.startContainer, range.startOffset)
    const end = this.offsetForEndpoint(range.endContainer, range.endOffset)
    if (approximate === null || end === null) return null
    for (const element of this.mountedImages) {
      if (range.intersectsNode(element)) return null
    }
    return { quote: range.toString(), approximate }
  }

  rangeForText(quote: string, approximate: number): Range | null {
    const starts: number[] = []
    for (let at = this.text.indexOf(quote); at >= 0; at = this.text.indexOf(quote, at + 1)) starts.push(at)
    const start = starts.toSorted((a, b) => Math.abs(a - approximate) - Math.abs(b - approximate))[0]
    if (start === undefined) return null
    const end = start + quote.length
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

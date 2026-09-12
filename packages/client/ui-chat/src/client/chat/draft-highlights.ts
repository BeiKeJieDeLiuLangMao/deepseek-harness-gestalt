/** Page-wide aggregation for unsent annotation marks rendered by CSS Highlights. */

type HighlightConstructor = new (...ranges: Range[]) => unknown
interface HighlightRegistry { set(name: string, value: unknown): void; delete(name: string): void }

const DRAFT_MARK_NAME = 'annotation-draft-mark'
const owners = new Map<object, readonly Range[]>()

function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightConstructor } | null {
  const runtime = globalThis as unknown as {
    CSS?: { highlights?: HighlightRegistry }
    Highlight?: HighlightConstructor
  }
  const registry = runtime.CSS?.highlights
  const Highlight = runtime.Highlight
  return registry === undefined || Highlight === undefined ? null : { registry, Highlight }
}

function publish(): void {
  const api = highlightApi()
  if (api === null) return
  const ranges = [...owners.values()].flat()
  if (ranges.length === 0) api.registry.delete(DRAFT_MARK_NAME)
  else api.registry.set(DRAFT_MARK_NAME, new api.Highlight(...ranges))
}

/**
 * Replace one mounted target's contribution without disturbing other targets.
 * @param owner - Stable mounted-target identity.
 * @param ranges - Current Draft Mark ranges for that target.
 */
export function replaceDraftHighlightRanges(owner: object, ranges: readonly Range[]): void {
  if (ranges.length === 0) owners.delete(owner)
  else owners.set(owner, ranges)
  publish()
}

/**
 * Release one unmounted target's ranges and republish all remaining marks.
 * @param owner - Stable mounted-target identity.
 */
export function removeDraftHighlightOwner(owner: object): void {
  owners.delete(owner)
  publish()
}

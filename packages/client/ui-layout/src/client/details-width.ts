/**
 * Width preferences a details occupant supplies to the layout owner. Values
 * are positive px and ordered `minimum <= default <= maximum`.
 */
export interface DetailsWidthRange {
  /** Smallest useful rendered width in px. */
  readonly minimum: number
  /** Width applied when the occupant opens or reopens in px. */
  readonly default: number
  /** Largest width reachable by dragging in px. */
  readonly maximum: number
}

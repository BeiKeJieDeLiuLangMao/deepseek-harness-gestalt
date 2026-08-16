/** Desktop wordmark: same whale + deepseek letterforms, GESTALT plate. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { GestaltWordmark } from './GestaltWordmark.tsx'

/** Chain occupant for `sidebar.brand`. */
export type BrandSeatProps = PropsRuntime<'sidebar.brand'>

/**
 * Render the GESTALT wordmark.
 * @param _props - chain owner share (wide is unused; the shell unmounts this on the rail).
 * @returns the wordmark svg.
 */
export function BrandSeat(_props: BrandSeatProps) {
  return <GestaltWordmark />
}

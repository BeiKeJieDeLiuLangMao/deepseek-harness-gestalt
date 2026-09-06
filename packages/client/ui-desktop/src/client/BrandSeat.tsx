/** Desktop wordmark: official whale and letterforms with the GESTALT plate. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandWordmark } from '@deepseek-ai/dsh-client-ui-primitives'

/** Props derived from the sidebar's brand-name slot. */
export type BrandSeatProps = PropsRuntime<'sidebar.brand.name'>

/**
 * Render the GESTALT wordmark without duplicating the independently slotted mark.
 * @param _props - root-scoped slot props.
 * @returns the decorative product wordmark.
 */
export function BrandSeat(_props: BrandSeatProps) {
  return <BrandWordmark includeMark={false} badge="gestalt" />
}

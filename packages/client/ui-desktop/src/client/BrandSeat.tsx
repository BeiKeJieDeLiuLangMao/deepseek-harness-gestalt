/** Desktop GESTALT name artwork for the sidebar brand seat. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { GestaltBrandName } from './GestaltBrandName.tsx'

/** Props derived from the sidebar's brand-name slot. */
export type BrandSeatProps = PropsRuntime<'sidebar.brand.name'>

/**
 * Render the GESTALT product name beside the independently slotted whale mark.
 * @param _props - root-scoped slot props.
 * @returns the decorative product name.
 */
export function BrandSeat(_props: BrandSeatProps) {
  return <GestaltBrandName />
}

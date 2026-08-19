import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'

/** One labeled settings-slot tab projected from a registration entry. */
export interface LabeledSlotTab {
  /** Registration id written when this tab is selected. */
  id: string
  /** Registration order; lower first. */
  order: number
  /** Localized tab label. */
  label: string
}

/**
 * Project a slot registration into a labeled tab row.
 * @param entry - slot ledger entry whose options carry id, order, and label.
 * @returns the tab the section or card renders.
 */
export function labeledSlotTab(entry: {
  options: { id?: string; order?: number; label?: unknown }
}): LabeledSlotTab {
  return {
    /* v8 ignore next -- list-slot registration requires id */
    id: entry.options.id ?? '',
    order: entry.options.order ?? 0,
    label: resolveSlotLabel(entry.options.label) ?? '',
  }
}

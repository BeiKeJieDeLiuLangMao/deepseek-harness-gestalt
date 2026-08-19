/** Mobile settlement of Desktop-authorized approvals and Ask User questions. */

/** One Desktop-authorized interaction presented on Mobile. */
export interface CompanionInteraction {
  /** Idempotency key. */
  operationId: string
  /** Approval or Ask User. */
  kind: 'approval' | 'ask-user'
  /** Current arguments or question text. */
  summary: string
  /** Optional cwd shown for approvals. */
  cwd?: string
  /** Optional diff summary. */
  diff?: string
  /** Optional terminal summary. */
  terminal?: string
  /** Decisions Desktop already authorized, including persistent ones. */
  authorized: readonly string[]
  /** Desktop-authoritative settlement, if any. */
  settled?: { decision: string; persistent?: boolean }
}

/**
 * Apply a Mobile decision only after Desktop acceptance and only if unset.
 * @param interaction - current interaction.
 * @param input - Mobile decision.
 * @returns the Desktop-authoritative interaction.
 */
export function settleCompanionInteraction(
  interaction: CompanionInteraction,
  input: { accepted: boolean; decision: string; persistent?: boolean; stale?: boolean },
): CompanionInteraction {
  if (interaction.settled !== undefined) return interaction
  if (!input.accepted || input.stale === true) return interaction
  return {
    ...interaction,
    settled: { decision: input.decision, ...(input.persistent === true ? { persistent: true } : {}) },
  }
}

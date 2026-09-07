/** Shared teardown error collection for assembled Desktop specs. */

/**
 * Attempt every registered cleanup in reverse registration order, then the
 * final stop concern, each in its own try; rethrow the single failure or an
 * AggregateError carrying all of them after every concern was attempted.
 *
 * @param cleanups - registry consumed (splice) in reverse registration order.
 * @param afterAll - final concern (Host stop) attempted after the cleanups.
 */
export async function runTeardown(
  cleanups: Array<() => void | Promise<void>>,
  afterAll: () => void | Promise<void>,
): Promise<void> {
  const teardownErrors: unknown[] = []
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { await cleanup() } catch (error) { teardownErrors.push(error) }
  }
  try { await afterAll() } catch (error) { teardownErrors.push(error) }
  if (teardownErrors.length === 1) throw teardownErrors[0]
  if (teardownErrors.length > 1) throw new AggregateError(teardownErrors, 'multiple teardown failures')
}

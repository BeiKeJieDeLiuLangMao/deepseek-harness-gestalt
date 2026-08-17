/** Desktop owner cleanup that observes every independently started disposal. */

/**
 * Dispose Account and Personal Pairing owners concurrently and aggregate failures.
 * @param account - Account lifecycle owner.
 * @param pairing - Personal Pairing lifecycle owner.
 */
export async function disposeDesktopOwners(
  account: { dispose(): Promise<void> },
  pairing: { dispose(): Promise<void> },
): Promise<void> {
  const results = await Promise.allSettled([account.dispose(), pairing.dispose()])
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason as unknown)
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Desktop owner disposal failed')
}

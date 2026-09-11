/** Package-owned registration invariant for the official Phone definition. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { buildOfficialPhoneDefinition, PHONE_DEFINITION_ID, type PhoneListingSource } from './client/registry.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-phone'

/** Cordis companion plugin name. */
export const name = 'client-ui-phone-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

const emptyListing: PhoneListingSource = {
  getBadge: () => ({ onlineCount: 0 }),
  snapshot: () => ({ android: [], ios: [] }),
  refresh: async () => {},
  subscribe: () => () => {},
}

/** Verify that the official definition keeps the package's stable identity and singleton kind. */
const install: InvariantInstaller = (_ctx, fail) => {
  const definition = buildOfficialPhoneDefinition({
    source: emptyListing,
    title: () => 'Phone',
    occupiedTitle: name => `Phone · ${name}`,
  })
  if (definition.id !== PHONE_DEFINITION_ID || definition.kind !== 'phone' || definition.single !== true) {
    fail('the official Phone singleton definition is malformed')
  }
}

/** Register the Phone invariant companion. */
export const apply = (ctx: Context): void => {
  ctx.invariants.register(PACKAGE_NAME, install)
}

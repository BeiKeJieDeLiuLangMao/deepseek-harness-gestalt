/** Real Loader fixture that contributes one deferred weather tool. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'deferred-tool-search-fixture'
export const inject = ['tools']

/** Register the deferred tool exercised by the keyless continuation snapshot. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'weather_lookup',
    description: 'Look up the current weather for one city.',
    parameters: {
      city: { type: 'string', required: true, description: 'City to look up.' },
    },
    deferLoading: true,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `${args.city}: sunny`
    },
  }))
}

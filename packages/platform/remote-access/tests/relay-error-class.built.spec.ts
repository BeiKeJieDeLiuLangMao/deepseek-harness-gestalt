import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const BUILT_PROVIDER = resolve(import.meta.dirname, '../lib/relay-provider.js')

describe('built Relay provider class identity', () => {
  it.skipIf(!existsSync(BUILT_PROVIDER))(
    'imports RemoteRelayError from the public package instead of bundling a second constructor',
    async () => {
      const source = await readFile(BUILT_PROVIDER, 'utf8')
      expect(source).toMatch(
        /import\s*\{[^}]*RemoteRelayError[^}]*\}\s*from\s*"@deepseek-ai\/dsh-remote-access"/,
      )
      expect(source).not.toMatch(/var RemoteRelayError = class/)
    },
  )
})

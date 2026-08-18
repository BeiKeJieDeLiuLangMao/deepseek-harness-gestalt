import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/relay-loader-smoke.mjs', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/relay-loader.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url))

describe('Remote Relay WSS publication', () => {
  it('boots the shipped bare subpath through the real Loader', async () => {
    const result = await runLoaderSmoke({
      label: 'Remote Relay WSS bare-subpath Loader smoke',
      tempDirPrefix: 'dsh-relay-loader-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
    })

    expect(result.stdout).toBe('RELAY_LOADER bare-subpath=active\n')
    expect(result.stderr).toBe('')
  })
})

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/driver.ts', import.meta.url))
const config = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('Remote Protocol keyless assembled path', () => {
  it('boots the Loader and carries one encrypted Mobile operation to a Desktop-confirmed result', async () => {
    const result = await runLoaderSmoke({
      label: 'remote-protocol-keyless',
      tempDirPrefix: 'remote-protocol-keyless-',
      binScript: driver,
      libBinScript: driver,
      configPath: config,
      tsconfigPath: tsconfig,
    })
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatchInlineSnapshot(`
      "TRANSPORT version=1
      COMPANION version=2 security=preserved
      MOBILE_REQUEST encrypted=true relayPlaintext=false type=submit-prompt
      DESKTOP_RESPONSE confirmed=true outcome=accepted
      NEGOTIATION mismatch=COMPANION_UPDATE_REQUIRED update=mobile applicationPlaintextSent=false
      "
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/driver.ts', import.meta.url))
const config = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('Personal Pairing keyless assembled path', () => {
  it('boots the Loader and activates only a confirmed same-account Companion principal', async () => {
    const result = await runLoaderSmoke({
      label: 'personal-pairing-keyless',
      tempDirPrefix: 'personal-pairing-keyless-',
      binScript: driver,
      libBinScript: driver,
      configPath: config,
      tsconfigPath: tsconfig,
    })
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatchInlineSnapshot(`
      "MOBILE_ACCESS default=false
      CROSS_ACCOUNT result=PAIRING_ACCOUNT_MISMATCH principals=0
      CHALLENGE ttlMs=120000 secretBits=256 qrEqualsLink=true
      AUTH_WORDS mobile=amber-binary-cedar-delta-ember-frost desktop=amber-binary-cedar-delta-ember-frost
      CONFIRM mobile=paired active=1 authority=companion-surface
      CAPABILITY_DESTROYED challenge=2 pending=1
      FLOW transport=http consumer=ctx.remoteAccess
      CRYPTO provider=keyless-proof reviewed=false
      "
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/driver.ts', import.meta.url))
const config = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('Platform Account keyless assembled lifecycle', () => {
  it('boots the Loader, logs in through two instances, and signs out this installation', async () => {
    const result = await runLoaderSmoke({
      label: 'platform-account-keyless',
      tempDirPrefix: 'platform-account-keyless-',
      binScript: driver,
      libBinScript: driver,
      configPath: config,
      tsconfigPath: tsconfig,
    })
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatchInlineSnapshot(`
      "PRIVACY zh+en before authorization
      NOTICE accepted
      AUTHORIZE system-browser=https://github.com scope=none pkce=S256
      ACCOUNT githubId=13994321 login=octocat
      SESSION accessMinutes=15 refreshDays=30
      SIGN_OUT crossInstanceClosed=true local=idle
      "
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})

import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/driver.ts', import.meta.url))
const config = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('two-instance Remote Relay keyless assembled path', () => {
  it('crosses non-sticky Platform instances, resynchronizes after replacement, and never queues offline work', async () => {
    const result = await runLoaderSmoke({
      label: 'two-instance-relay-keyless',
      tempDirPrefix: 'two-instance-relay-keyless-',
      binScript: driver,
      libBinScript: driver,
      configPath: config,
      tsconfigPath: tsconfig,
    })
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatchInlineSnapshot(`
      "PLATFORM endpoint=one nonSticky=true mobile=platform-a desktop=platform-b
      ROUND_TRIP encrypted=true relayBusinessValue=false outcome=accepted
      FAILOVER liveSocketMigration=false desktopReconnect=platform-a resync=2
      OFFLINE code=REMOTE_OFFLINE queued=0
      LIFECYCLE windowClose=offline sleep=offline quit=offline disable=offline backgroundHost=false remoteWake=false
      CRYPTO product=fail-closed keylessScenario=true
      "
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})

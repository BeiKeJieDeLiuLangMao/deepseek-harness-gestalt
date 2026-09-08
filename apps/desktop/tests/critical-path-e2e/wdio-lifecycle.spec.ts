/** Process evidence survives a failing test after asynchronous service initialization. */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { readProcessEvidence } from './artifact-io.ts'

const { browserDouble } = vi.hoisted(() => ({
  browserDouble: {
    electron: undefined as undefined | { execute: (fn: () => number) => Promise<number> },
    saveScreenshot: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@wdio/globals', () => ({ browser: browserDouble }))

it('captures a real process identity after service readiness and retains it when the test fails', async () => {
  const artifacts = await mkdtemp(join(tmpdir(), 'dsh-critical-lifecycle-'))
  vi.stubEnv('DSH_CRITICAL_PATH_ARTIFACT_DIR', artifacts)
  vi.stubEnv('DSH_CRITICAL_PATH_PHASE', 'create')
  vi.stubEnv('DSH_CRITICAL_PATH_USER_DATA', join(artifacts, 'user-data'))
  vi.stubEnv('DSH_CRITICAL_PATH_PROFILE', join(artifacts, 'profile'))
  const { config } = await import('./wdio.conf.ts')
  const invoke = async (hook: unknown, args: unknown[] = []): Promise<void> => {
    if (typeof hook === 'function') await Reflect.apply(hook, browserDouble, args)
  }
  try {
    // WDIO runs config.before concurrently with the service's asynchronous before hook.
    await Promise.all([
      Promise.resolve().then(() => {
        browserDouble.electron = { execute: async fn => fn() }
      }),
      invoke(config.before),
    ])
    await invoke(config.beforeTest)
    const evidence = (await readProcessEvidence(artifacts)).create
    expect(evidence?.electron?.pid).toBe(process.pid)
    expect(evidence?.electron?.started).toBeTruthy()
    await invoke(config.afterTest, [{ title: 'failing phase', pending: false }, {}, { passed: false }])
    expect((await readProcessEvidence(artifacts)).create?.electron).toEqual(evidence?.electron)
    expect(JSON.parse(await readFile(join(artifacts, 'create', 'test-result.json'), 'utf8'))).toMatchObject({ failed: 1, passed: 0 })
    expect(browserDouble.saveScreenshot).toHaveBeenCalledWith(join(artifacts, 'create', 'failing-phase-fail.png'))
  } finally {
    await invoke(config.after)
    browserDouble.electron = undefined
    vi.unstubAllEnvs()
    await rm(artifacts, { recursive: true, force: true })
  }
})

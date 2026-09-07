import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { ownAcceptanceChild } from '../../scripts/hidden-acceptance-owner.mjs'

test('opt-in fake holds actual H264 bytes until paint and ends the held stream on failure', async () => {
  const scratch = mkdtempSync(join(tmpdir(), '610-fixture-test-'))
  const evidence = mkdtempSync(join(tmpdir(), '610-fixture-evidence-'))
  const fixtures = resolve('packages/phone/phone-runtime/tests/fixtures')
  for (const file of ['fakemobilecli.mjs', 'u3-visible-frames.ts']) copyFileSync(join(fixtures, file), join(scratch, file))
  writeFileSync(join(scratch, 'fakemobilecli.config.json'), JSON.stringify({ acceptanceHoldH264: true, ownerToken: 'unit-owner' }))
  const lease = createServer()
  await new Promise(resolve => lease.listen(0, '127.0.0.1', resolve))
  const port = lease.address().port
  await new Promise(resolve => lease.close(resolve))
  const origin = `http://127.0.0.1:${port}`
  const owner = ownAcceptanceChild({ command: process.execPath, args: [join(scratch, 'fakemobilecli.mjs'), 'server', '--listen', `127.0.0.1:${port}`], cwd: scratch, env: {}, scratch,
    recordFile: join(evidence, 'ownership.json'), logFile: join(evidence, 'runner.log'), runMs: 5_000, cleanupMs: 2_000, verifyCompletion: async () => {},
  })
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { ready = (await fetch(`${origin}/__test/pid`, { signal: AbortSignal.timeout(100) })).ok } catch { /* The freshly spawned fixture may not have bound its socket yet. */ }
      if (ready) break
      await delay(25)
    }
    assert.equal(ready, true)
    const response = await fetch(`${origin}/stream?s=avc`, { signal: AbortSignal.timeout(3_000) })
    assert.equal(response.headers.get('content-type'), 'video/h264')
    const reader = response.body.getReader()
    const pending = reader.read()
    assert.equal(await Promise.race([pending.then(() => 'bytes'), delay(100).then(() => 'held')]), 'held')
    await fetch(`${origin}/__test/h264/paint`, { method: 'POST' })
    const first = await pending
    assert.ok(first.value.length > 100)
    assert.deepEqual([...first.value.slice(0, 4)], [0, 0, 0, 1])
    await fetch(`${origin}/__test/h264/fail`, { method: 'POST' })
    let ended = false
    while (!ended) ended = (await reader.read()).done
    assert.equal(ended, true)
  } finally {
    await assert.rejects(owner.cleanup(), /required TERM recovery/)
    await owner.exited
    // This directly created byte fixture has no descendants; its test, not the runner, owns removal.
    rmSync(scratch, { recursive: true })
    rmSync(evidence, { recursive: true })
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ownAcceptanceChild } from '../../scripts/hidden-acceptance-owner.mjs'

function setup(script, verifyCompletion = async () => {}) {
  const evidence = mkdtempSync(join(tmpdir(), '610-owner-test-evidence-'))
  const scratch = mkdtempSync(join(tmpdir(), '610-owner-test-scratch-'))
  const owner = ownAcceptanceChild({
    command: process.execPath, args: ['-e', script], cwd: scratch, env: { PATH: '/usr/bin:/bin' },
    scratch, recordFile: join(evidence, 'ownership.json'), logFile: join(evidence, 'runner.log'),
    runMs: 10_000, cleanupMs: 5_000, verifyCompletion,
  })
  return { owner, scratch, evidence }
}

async function finishFixture({ owner, scratch, evidence }) {
  await owner.cleanup().catch(() => {})
  await owner.exited
  rmSync(scratch, { recursive: true })
  rmSync(evidence, { recursive: true })
}

test('zero exit records ownership and verifies graceful completion once', async () => {
  let verifies = 0
  const fixture = setup('process.exit(0)', async () => { verifies += 1 })
  try {
    assert.equal(JSON.parse(readFileSync(join(fixture.evidence, 'ownership.json'))).launcherPid, fixture.owner.child.pid)
    assert.deepEqual(await fixture.owner.finished, { code: 0, signal: null })
    const first = fixture.owner.cleanup()
    assert.equal(fixture.owner.cleanup(), first)
    await first
    assert.equal(verifies, 1)
    assert.equal(JSON.parse(readFileSync(join(fixture.evidence, 'ownership.json'))).completion, 'verified')
    assert.equal(existsSync(fixture.scratch), true)
  } finally { await finishFixture(fixture) }
})

test('nonzero exit cannot claim graceful completion', async () => {
  const fixture = setup('process.exit(9)')
  try {
    assert.deepEqual(await fixture.owner.finished, { code: 9, signal: null })
    await assert.rejects(fixture.owner.cleanup(), /exited code=9/)
  } finally { await finishFixture(fixture) }
})

test('completion verifier failure retains scratch', async () => {
  const fixture = setup('process.exit(0)', async () => { throw new Error('receipt missing') })
  try {
    await fixture.owner.finished
    await assert.rejects(fixture.owner.cleanup(), /receipt missing/)
    assert.equal(existsSync(fixture.scratch), true)
  } finally { await finishFixture(fixture) }
})

test('missing completion verifier cannot pass', async () => {
  const fixture = setup('process.exit(0)', null)
  try {
    await fixture.owner.finished
    await assert.rejects(fixture.owner.cleanup(), /verifier is missing/)
  } finally { await finishFixture(fixture) }
})

test('inherited pipe remains open after observed launcher exit without granting signal authority', async () => {
  const script = `const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),1500)'],{stdio:['ignore',1,2]}).unref();setTimeout(()=>process.exit(0),100)`
  const fixture = setup(script)
  let closed = false
  const drained = new Promise(resolve => fixture.owner.child.once('close', () => { closed = true; resolve() }))
  try {
    assert.equal((await fixture.owner.finished).code, 0)
    assert.equal(closed, false)
    await fixture.owner.cleanup()
    assert.equal(existsSync(fixture.scratch), true)
  } finally {
    await drained
    // The descendant has a self-exit deadline; allow it to finish without any discovery-based signal.
    await delay(1_600)
    await finishFixture(fixture)
  }
})

test('TERM recovery only stops the directly created launcher and retains scratch', async () => {
  const fixture = setup('setInterval(()=>{},1000)')
  try {
    await delay(100)
    await assert.rejects(fixture.owner.cleanup(), /required TERM recovery/)
    assert.equal((await fixture.owner.exited).signal, 'SIGTERM')
    assert.equal(existsSync(fixture.scratch), true)
  } finally { await finishFixture(fixture) }
})

test('command substring observer is never discovered or signaled', async () => {
  const fixture = setup('process.exit(0)')
  const observer = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', fixture.scratch], { stdio: 'ignore', env: {} })
  const observerExited = new Promise(resolve => observer.once('exit', resolve))
  try {
    await fixture.owner.finished
    await fixture.owner.cleanup()
    assert.equal(observer.exitCode, null)
    assert.equal(observer.signalCode, null)
    assert.equal(JSON.parse(readFileSync(join(fixture.evidence, 'ownership.json'))).processes, undefined)
  } finally {
    observer.kill('SIGTERM')
    await observerExited
    await finishFixture(fixture)
  }
})

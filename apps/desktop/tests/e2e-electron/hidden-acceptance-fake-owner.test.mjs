import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ownHiddenPhoneFake } from '../../scripts/hidden-phone-fake-owner.mjs'

async function setup() {
  const root = mkdtempSync(join(tmpdir(), '610-direct-fake-'))
  for (const file of ['fakemobilecli.mjs', 'u3-visible-frames.ts']) copyFileSync(resolve('packages/phone/phone-runtime/tests/fixtures', file), join(root, file))
  writeFileSync(join(root, 'fakemobilecli.config.json'), JSON.stringify({ ownerToken: 'owned-unit-fake' }))
  return root
}
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}
async function close(server) {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
function start(root, port) {
  return ownHiddenPhoneFake({ node: process.execPath, executable: join(root, 'fakemobilecli.mjs'), cwd: root, env: {}, port, ownerToken: 'owned-unit-fake', recordFile: join(root, 'ownership.json') })
}

test('direct fake records creation before readiness, handshakes exact PID, and stops once', async () => {
  const root = await setup()
  const lease = createServer()
  const port = await listen(lease)
  await close(lease)
  const owner = start(root, port)
  try {
    assert.equal(JSON.parse(readFileSync(join(root, 'ownership.json'))).pid, owner.child.pid)
    assert.deepEqual(await owner.ready, { pid: owner.child.pid, port })
    const first = owner.stop()
    assert.equal(owner.stop(), first)
    assert.equal((await first).signal, 'SIGTERM')
  } finally {
    await owner.stop()
    rmSync(root, { recursive: true })
  }
})

test('existing listener is a collision, not an attach claim or signal target', async () => {
  const root = await setup()
  const stranger = createServer((_request, response) => response.end(JSON.stringify({ pid: process.pid, ownerToken: 'unowned' })))
  const port = await listen(stranger)
  const owner = start(root, port)
  try {
    await assert.rejects(owner.ready, /identity mismatch/)
    await owner.stop()
    const response = await fetch(`http://127.0.0.1:${port}/__test/pid`)
    assert.equal((await response.json()).ownerToken, 'unowned')
  } finally {
    await owner.stop()
    await close(stranger)
    rmSync(root, { recursive: true })
  }
})

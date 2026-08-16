import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { spawnWebHost, type RunningWebHost } from '../src/spawn-web-host.ts'

const here = dirname(fileURLToPath(import.meta.url))
const children: RunningWebHost[] = []

afterEach(async () => {
  await Promise.all(children.map(async running => running.stop()))
  children.length = 0
})

describe('spawnWebHost', () => {
  it('resolves the loopback URL from mixed stdout', async () => {
    const running = await spawnWebHost({
      node: process.execPath,
      args: [join(here, 'fixtures', 'announce-url.mjs')],
      cwd: here,
    }, 5_000)
    children.push(running)
    expect(running.url).toBe('http://127.0.0.1:34567')
    expect(running.child.exitCode).toBeNull()
  })

  it('rejects when the child exits before announcing a URL', async () => {
    await expect(spawnWebHost({
      node: process.execPath,
      args: [join(here, 'fixtures', 'exit-before-url.mjs')],
      cwd: here,
    }, 5_000)).rejects.toThrow(/exited before announcing a URL/)
  })

  it('stops the child and waits for process exit', async () => {
    const running = await spawnWebHost({
      node: process.execPath,
      args: [join(here, 'fixtures', 'announce-url.mjs')],
      cwd: here,
    }, 5_000)
    children.push(running)

    await running.stop()

    expect(running.child.exitCode ?? running.child.signalCode).not.toBeNull()
  })
})

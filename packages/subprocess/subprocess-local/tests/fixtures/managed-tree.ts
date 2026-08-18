import { spawn } from 'node:child_process'
import { access, open, rename, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

const [statePath, publishStartedPath, publishProceedPath, maxWriteBytesText] = process.argv.slice(2)
const maxWriteBytes = maxWriteBytesText === undefined ? undefined : Number(maxWriteBytesText)
if (statePath === undefined || (publishStartedPath === undefined) !== (publishProceedPath === undefined)
  || (maxWriteBytes !== undefined && (!Number.isSafeInteger(maxWriteBytes) || maxWriteBytes <= 0))) {
  throw new Error(
    'usage: managed-tree.ts <state-path> [<publish-started-path> <publish-proceed-path> [<max-write-bytes>]]',
  )
}

async function waitForFile(path: string): Promise<void> {
  for (;;) {
    try {
      await access(path)
      return
    } catch (_notReady) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}

async function writeAll(file: FileHandle, data: Buffer, maxWriteBytes?: number): Promise<void> {
  let offset = 0
  while (offset < data.length) {
    const remaining = data.length - offset
    const requested = Math.min(remaining, maxWriteBytes ?? remaining)
    const { bytesWritten } = await file.write(data, offset, requested)
    if (bytesWritten <= 0) throw new Error('managed-tree state write made no progress')
    offset += bytesWritten
  }
}

process.on('SIGTERM', () => {})
process.on('SIGHUP', () => {})
const descendant = spawn(process.execPath, [
  '-e',
  'process.on("SIGTERM",()=>{});process.on("SIGHUP",()=>{});setInterval(()=>{},60_000)',
], { stdio: 'ignore' })
if (descendant.pid === undefined) throw new Error('managed descendant did not publish a pid')

const state = JSON.stringify({ root: process.pid, descendant: descendant.pid })
const stagedStatePath = `${statePath}.${process.pid}.tmp`
const stateFile = await open(stagedStatePath, 'wx', 0o600)
try {
  if (publishStartedPath === undefined || publishProceedPath === undefined) {
    await stateFile.writeFile(state)
  } else {
    const stateBytes = Buffer.from(state)
    const split = Math.floor(stateBytes.length / 2)
    const first = stateBytes.subarray(0, split)
    const second = stateBytes.subarray(split)
    await writeAll(stateFile, first, maxWriteBytes)
    await writeFile(publishStartedPath, 'started')
    await waitForFile(publishProceedPath)
    await writeAll(stateFile, second, maxWriteBytes)
  }
  await stateFile.sync()
} finally {
  await stateFile.close()
}
await rename(stagedStatePath, statePath)
setInterval(() => {}, 60_000)

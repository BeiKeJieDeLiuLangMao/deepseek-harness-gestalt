import { spawn } from 'node:child_process'
import { access, open, rename, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

const [
  statePath,
  publishStartedPath,
  publishProceedPath,
  descendantStartedPath,
  descendantProceedPath,
  maxWriteBytesText,
]
  = process.argv.slice(2)
const maxWriteBytes = maxWriteBytesText === undefined ? undefined : Number(maxWriteBytesText)
if (statePath === undefined || (publishStartedPath === undefined) !== (publishProceedPath === undefined)
  || (publishStartedPath !== undefined
    && (descendantStartedPath === undefined || descendantProceedPath === undefined))
  || (maxWriteBytes !== undefined && (!Number.isSafeInteger(maxWriteBytes) || maxWriteBytes < 0))) {
  throw new Error(
    'usage: managed-tree.ts <state-path> '
      + '[<publish-started-path> <publish-proceed-path> '
      + '<descendant-started-path> <descendant-proceed-path> [<max-write-bytes>]]',
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

type StateWrite = (data: Buffer, offset: number, requested: number) => Promise<{ bytesWritten: number }>

function createStateWrite(file: FileHandle, maxBytes?: number): StateWrite {
  return (data, offset, requested) => {
    if (maxBytes === 0) return Promise.resolve({ bytesWritten: 0 })
    return file.write(data, offset, Math.min(requested, maxBytes ?? requested))
  }
}

async function writeAll(write: StateWrite, data: Buffer): Promise<void> {
  let offset = 0
  while (offset < data.length) {
    const requested = data.length - offset
    const { bytesWritten } = await write(data, offset, requested)
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
const descendantDone = new Promise<void>((resolve) => {
  descendant.once('exit', () => { resolve() })
  descendant.once('error', () => { resolve() })
})

try {
  if (descendantStartedPath !== undefined && descendantProceedPath !== undefined) {
    await writeFile(descendantStartedPath, String(descendant.pid))
    await waitForFile(descendantProceedPath)
  }

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
      const write = createStateWrite(stateFile, maxWriteBytes)
      await writeAll(write, first)
      await writeFile(publishStartedPath, 'started')
      await waitForFile(publishProceedPath)
      await writeAll(write, second)
    }
    await stateFile.sync()
  } finally {
    await stateFile.close()
  }
  await rename(stagedStatePath, statePath)
} catch (publicationError) {
  descendant.kill('SIGKILL')
  await descendantDone
  throw publicationError
}
setInterval(() => {}, 60_000)

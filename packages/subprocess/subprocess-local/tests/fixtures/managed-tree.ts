import { spawn } from 'node:child_process'
import { access, open, rename, writeFile } from 'node:fs/promises'

const [statePath, publishStartedPath, publishProceedPath] = process.argv.slice(2)
if (statePath === undefined || (publishStartedPath === undefined) !== (publishProceedPath === undefined)) {
  throw new Error('usage: managed-tree.ts <state-path> [<publish-started-path> <publish-proceed-path>]')
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
    await stateFile.write(state.slice(0, 1))
    await writeFile(publishStartedPath, 'started')
    await waitForFile(publishProceedPath)
    await stateFile.write(state.slice(1))
  }
  await stateFile.sync()
} finally {
  await stateFile.close()
}
await rename(stagedStatePath, statePath)
setInterval(() => {}, 60_000)

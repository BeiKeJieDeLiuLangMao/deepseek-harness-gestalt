/** Direct launcher ownership for one bounded hidden Desktop acceptance run. */
import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * Record the directly created launcher before readiness and observe exit independently of pipe close.
 * Cleanup may TERM only this captured ChildProcess. A normal exit succeeds only after the supplied
 * verifier proves the graceful Host/fake shutdown receipt and listener closure.
 * @param options Exact launcher, private evidence paths, environment and bounded intervals.
 * @returns Launcher observations and one memoized completion/recovery operation.
 */
export function ownAcceptanceChild(options) {
  let child
  let outcome
  let cleanupPromise
  let recoveryRequested = false
  let completion = 'pending'
  const persist = () => writeFileSync(options.recordFile, JSON.stringify({
    launcherPid: child?.pid, outcome, scratch: options.scratch,
    recoveryRequested, completion,
  }, null, 2) + '\n', { mode: 0o600 })
  persist()
  child = spawn(options.command, options.args, {
    cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = new Promise(resolve => {
    child.once('error', error => { outcome = { error: error.message }; persist(); resolve(outcome) })
    child.once('exit', (code, signal) => { outcome = { code, signal }; persist(); resolve(outcome) })
  })
  persist()
  const output = chunk => appendFileSync(options.logFile, chunk, { mode: 0o600 })
  child.stdout.on('data', output)
  child.stderr.on('data', output)
  const finished = (async () => {
    const deadline = Date.now() + options.runMs
    while (!outcome && Date.now() < deadline) await delay(25)
    return outcome ?? { timedOut: true }
  })()
  const cleanup = () => cleanupPromise ??= Promise.resolve().then(async () => {
    try {
      if (!outcome) {
        recoveryRequested = true
        persist()
        if (child.pid !== undefined) child.kill('SIGTERM')
        const deadline = Date.now() + options.cleanupMs
        while (!outcome && Date.now() < deadline) await delay(25)
        if (!outcome) throw new Error('direct launcher did not exit within recovery deadline; scratch retained')
      }
      if (recoveryRequested) throw new Error('direct launcher required TERM recovery; scratch retained')
      if (outcome.error !== undefined) throw new Error(`direct launcher failed: ${outcome.error}; scratch retained`)
      if (outcome.code !== 0 || outcome.signal !== null) {
        throw new Error(`direct launcher exited code=${String(outcome.code)} signal=${String(outcome.signal)}; scratch retained`)
      }
      if (typeof options.verifyCompletion !== 'function') {
        throw new Error('graceful completion verifier is missing; scratch retained')
      }
      await options.verifyCompletion()
      completion = 'verified'
      persist()
    } catch (error) {
      completion = 'failed'
      persist()
      throw error
    } finally {
      child.stdout.destroy()
      child.stderr.destroy()
    }
  })
  return { child, exited, finished, cleanup }
}

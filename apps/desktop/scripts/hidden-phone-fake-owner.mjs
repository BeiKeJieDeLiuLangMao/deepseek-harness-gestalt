/** Direct owner of one staged fakemobilecli server; not an attach mode for the production phone runtime. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * Publish the exact created handle before probing its token/PID endpoint. A wrong listener is never signaled.
 * @param options Staged executable, private cwd/record, explicit environment, port and owner token.
 * @returns Readiness and memoized direct-child shutdown; caller retains scratch on failure.
 */
export function ownHiddenPhoneFake(options) {
  const record = { role: 'fake', pid: undefined, exit: undefined }
  const persist = () => writeFileSync(options.recordFile, JSON.stringify(record) + '\n', { mode: 0o600 })
  persist()
  const child = spawn(options.node, [options.executable, 'server', 'start', '--listen', `127.0.0.1:${options.port}`], {
    cwd: options.cwd, env: options.env, stdio: 'ignore',
  })
  record.pid = child.pid
  persist()
  let outcome
  child.once('error', error => { outcome = { error: error.message }; record.exit = outcome; persist() })
  child.once('exit', (code, signal) => { outcome = { code, signal }; record.exit = outcome; persist() })
  const ready = (async () => {
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      if (outcome) throw new Error('created fake exited before readiness')
      let response
      try {
        response = await fetch(`http://127.0.0.1:${options.port}/__test/pid`, { signal: AbortSignal.timeout(200) })
      } catch { /* Only connection startup failures are retried; identity mismatches below fail immediately. */ }
      if (response) {
        const identity = await response.json()
        if (identity.pid !== child.pid || identity.ownerToken !== options.ownerToken) throw new Error('fake listener identity mismatch; unknown listener untouched')
        return { pid: child.pid, port: options.port }
      }
      await delay(25)
    }
    throw new Error('created fake readiness deadline exceeded')
  })()
  let stopping
  const stop = () => stopping ??= Promise.resolve().then(async () => {
    if (!outcome && child.pid !== undefined) child.kill('SIGTERM')
    const deadline = Date.now() + 3_000
    while (!outcome && Date.now() < deadline) await delay(25)
    if (!outcome) throw new Error('created fake survived TERM; retain scratch')
    return outcome
  })
  return { child, ready, stop }
}

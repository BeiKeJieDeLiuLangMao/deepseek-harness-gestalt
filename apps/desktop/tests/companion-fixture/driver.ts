import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isFixtureResponse, type FixtureCommand, type FixtureRequest, type FixtureResults } from './wire.ts'

/** The child transport closed before its pending command returned; event ordering is not part of the contract. */
export class FixtureTransportClosedError extends Error {
  readonly code = 'FIXTURE_TRANSPORT_CLOSED'

  constructor(
    readonly closure: { kind: 'disconnected' } | { kind: 'exited'; exitCode: number | null; signal: NodeJS.Signals | null },
    detail: string,
  ) {
    super(detail)
    this.name = 'FixtureTransportClosedError'
  }
}

/** Launch one suite-local Host; successful disposal observes its exit.
 * Deadline rejection retains failed cleanup, not proof of quiescence. */
export function launchCompanionFixture(entry = new URL('./host.ts', import.meta.url)) {
  const child = fork(fileURLToPath(entry), [], {
    execArgv: ['--import', import.meta.resolve('tsx/esm')],
    serialization: 'advanced',
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-16_384) })
  let nextId = 0
  let ended = false
  let terminalError: Error | undefined
  let disposing: Promise<void> | undefined
  let markExited: () => void = () => { throw new Error('exit observer not initialized') }
  const exited = new Promise<void>((resolve) => { markExited = resolve })
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  child.once('exit', (code, signal) => {
    ended = true
    failAll(new FixtureTransportClosedError({ kind: 'exited', exitCode: code, signal }, `Companion fixture exited (${String(code)}, ${String(signal)}): ${stderr}`))
    markExited()
  })
  child.once('error', (error) => {
    terminalError = error
    failAll(error)
    // A failed spawn has no process and need not produce an exit event.
    if (child.pid === undefined) { ended = true; markExited() }
  })
  child.once('disconnect', () => { failAll(new FixtureTransportClosedError({ kind: 'disconnected' }, 'Companion fixture disconnected')) })
  child.on('message', (response: unknown) => {
    if (!isFixtureResponse(response)) {
      terminalError = new Error('Invalid Companion fixture response envelope')
      failAll(terminalError)
      return
    }
    const waiting = pending.get(response.id)
    if (waiting === undefined) {
      terminalError = new Error(`Unmatched Companion fixture response id ${response.id}`)
      failAll(terminalError)
      return
    }
    pending.delete(response.id)
    clearTimeout(waiting.timer)
    if (response.ok) waiting.resolve(response.value)
    else waiting.reject(new Error(response.error))
  })
  function failAll(error: Error): void {
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(error) }
    pending.clear()
  }
  function request<C extends FixtureCommand>(command: C): Promise<FixtureResults[C['type']]> {
    if (terminalError !== undefined) return Promise.reject(terminalError)
    if (ended || !child.connected) return Promise.reject(new FixtureTransportClosedError({ kind: 'disconnected' }, `Companion fixture is disconnected: ${stderr}`))
    if (disposing !== undefined && command.type !== 'dispose') return Promise.reject(new Error('Companion fixture is disposing'))
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Companion fixture ${command.type} timed out: ${stderr}`))
      }, 30_000)
      pending.set(id, {
        // Envelope validation and a pending id establish command correlation; payloads are asserted by the scenario.
        resolve: (value) => { resolve(value as FixtureResults[C['type']]) }, reject, timer,
      })
      try {
        child.send({ id, command } satisfies FixtureRequest, (error) => {
          if (error !== null) { clearTimeout(timer); pending.delete(id); reject(error) }
        })
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error instanceof Error ? error : new Error('Companion fixture send failed', { cause: error }))
      }
    })
  }
  function dispose(): Promise<void> {
    if (disposing !== undefined) return disposing
    let resolveDisposal: () => void = () => { throw new Error('disposal promise not initialized') }
    let rejectDisposal: (error: unknown) => void = () => { throw new Error('disposal promise not initialized') }
    disposing = new Promise<void>((resolve, reject) => {
      resolveDisposal = resolve
      rejectDisposal = reject
    })
    void stop().then(resolveDisposal, rejectDisposal)
    return disposing
  }
  async function stop(): Promise<void> {
    if (ended) {
      if (terminalError !== undefined) throw terminalError
      return
    }
    const errors: unknown[] = []
    const timeout = new Error('Companion fixture did not quiesce within disposal deadline')
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        errors.push(timeout)
        failAll(timeout)
        // This is the exact fork handle, never a PID lookup or process-wide signal.
        try { child.kill('SIGKILL') } catch (error) { errors.push(error) }
        resolve()
      }, 5_000)
    })
    try {
      if (child.connected && terminalError === undefined) {
        try { await Promise.race([request({ type: 'dispose' }).then(() => {}), deadline]) }
        catch (error) { errors.push(error) }
      }
      if (child.connected) {
        try { child.disconnect() } catch (error) { errors.push(error) }
      }
      await Promise.race([exited, deadline])
      if (!ended && !errors.includes(timeout)) errors.push(timeout)
      if (terminalError !== undefined) errors.push(terminalError)
    } finally {
      clearTimeout(timer)
      failAll(new Error('Companion fixture disposed'))
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Companion fixture disposal failed')
  }
  return { request, dispose }
}

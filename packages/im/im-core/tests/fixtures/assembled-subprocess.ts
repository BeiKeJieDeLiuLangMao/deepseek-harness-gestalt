import { PassThrough } from 'node:stream'
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type {
  SubprocessHandle,
  SubprocessOutputRead,
  SubprocessSpawnSpec,
  SubprocessTerminalHandle,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'

/** Captured `dws chat message send` argv from the fixture adapter. */
export const dwsSendArgv: string[][] = []

/**
 * Keyless DingTalk DWS subprocess: send returns a receipt unless the text is
 * the unknown-receipt probe; consumer streams stay open.
 */
export class AssembledStubSubprocess extends SubprocessRuntime {
  async resolveExecutable(command: string): Promise<string> {
    return `/bin/${command}`
  }

  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const isSend = spec.argv.includes('send')
    const isQuery = spec.argv.includes('query-send-status')
    if (isSend) dwsSendArgv.push([...spec.argv])

    const unknownReceipt = spec.argv.includes('身份待确认')
    let outJson = JSON.stringify({ openTaskId: 'dt-assembled-task-1', status: 'sent' })
    if (isQuery) outJson = JSON.stringify({ openTaskId: 'dt-assembled-task-1', status: 'success' })
    if (unknownReceipt) outJson = '{}'

    const read: SubprocessOutputRead = { text: outJson, nextOffset: outJson.length, lossy: false }
    const done = isSend || isQuery
      ? Promise.resolve({ exitCode: 0, signal: null })
      : new Promise<{ exitCode: number; signal: null }>(() => {})

    return {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      collected: {
        stdout: { readFrom: () => read },
        stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
      },
      done,
      terminate: () => {},
      waitForExit: () => Promise.resolve(true),
    }
  }

  async spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return {
      pid: spec.argv.length,
      output: new PassThrough(),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      write: async () => {},
      inspectForeground: async () => ({ processGroupId: 1, inputWaiting: true }),
      signalForeground: async () => 1,
      terminate: async () => {},
    }
  }
}

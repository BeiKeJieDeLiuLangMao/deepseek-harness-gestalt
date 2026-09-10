import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { PassThrough } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type {
  SubprocessHandle,
  SubprocessOutputRead,
  SubprocessSpawnSpec,
  SubprocessTerminalHandle,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type ImConfigService from '@deepseek-ai/dsh-im-core'
import type { DingTalkDwsAdapterService } from '@deepseek-ai/dsh-im-dingtalk'

const configPath = process.argv[2]
if (!configPath) throw new Error('configPath required')
const action = process.argv[3]
if (!action) throw new Error('action required: write | read')

class StubSubprocessRuntime extends SubprocessRuntime {
  async resolveExecutable(command: string): Promise<string> {
    return `/bin/${command}`
  }

  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const isSend = spec.argv.includes('send')
    const isQuery = spec.argv.includes('query-send-status')

    let outJson = JSON.stringify({ openTaskId: 'dt-loader-task-1', status: 'sent' })
    if (isQuery) {
      outJson = JSON.stringify({ openTaskId: 'dt-loader-task-1', status: 'success' })
    }

    const read: SubprocessOutputRead = { text: outJson, nextOffset: outJson.length, lossy: false }
    const done = isSend || isQuery
      ? Promise.resolve({ status: 'exited', exitCode: 0 } as const)
      : new Promise<{ status: 'exited'; exitCode: number }>(() => {}) // Consumer stream keeps running

    return {
      spec,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdoutReader: { read: () => read },
      stderrReader: { read: () => ({ text: '', nextOffset: 0, lossy: false }) },
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

const ctx = new Context()
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include

// Mount stub subprocess service as Cordis plugin so DingTalk DWS adapter subprocess dependency resolves natively
ctx.plugin(StubSubprocessRuntime)

// Pure Cordis Loader entry: loads cordis.yml via cordis:include, dynamically resolving packages
await ctx.loader.create({
  name: 'cordis:include',
  config: { path: pathToFileURL(configPath).href },
})
await ctx.loader.await()

// Access services resolved dynamically by the Loader
const configService = ctx.get('imConfig') as ImConfigService
if (!configService) throw new Error('imConfig service not loaded by real Loader')

const dtService = ctx.get('imDingtalk') as DingTalkDwsAdapterService
if (!dtService) throw new Error('imDingtalk service not loaded by real Loader')

const reportFile = './dt-loader-report.json'
const testAccountId = brandString<ImAccountId>('acc-loader-dingtalk-1')

if (action === 'write') {
  await configService.upsertAccount({
    id: testAccountId,
    platform: 'dingtalk',
    displayName: 'Loader DingTalk Integration Account',
    status: 'connected',
    paused: false,
    platformMetadata: { user_id: 'user-dt-loader-1' },
  })

  // Start consumer through real adapter loaded via cordis.yml
  await dtService.startConsumer(testAccountId)
  const consumerState = dtService.getConsumerState(testAccountId)

  // Send message through real adapter loaded via cordis.yml
  const sendRes = await dtService.sendMessage({
    accountId: testAccountId,
    conversationKind: 'group',
    targetId: 'cid-loader-group-1',
    text: 'Hello from real cordis.yml Loader integration test',
    isAi: true,
  })

  await writeFile(reportFile, JSON.stringify({
    phase: 'write',
    accountId: testAccountId,
    consumerRunning: consumerState.isRunning,
    sendSuccess: sendRes.status === 'sent',
    openTaskId: sendRes.openTaskId,
  }))
} else if (action === 'read') {
  // Re-read persisted account after process reboot
  const reloadedAccount = await configService.getAccount(testAccountId)
  const queryRes = await dtService.querySendStatus('dt-loader-task-1')

  await writeFile(reportFile, JSON.stringify({
    phase: 'read',
    accountExists: Boolean(reloadedAccount),
    accountDisplayName: reloadedAccount?.displayName,
    queryStatus: queryRes.status,
  }))
}

await ctx.fiber.dispose()

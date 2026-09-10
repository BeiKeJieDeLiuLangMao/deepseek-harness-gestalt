// @vitest-environment jsdom
/**
 * Keyless assembled IM takeover: real Loader driver, DingTalk fixture adapter,
 * production tested Agent, and Sidebar presentation of the same records.
 */
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ConversationTab, type ConversationTabProps } from '../../../client/ui-im/src/client/ConversationTab.tsx'
import { createImGuiFace } from '../../../client/ui-im/src/client/controller.ts'
import { createImGuiStore, emptyGuiSnapshot } from '../../../client/ui-im/src/client/model.ts'
import { zh } from '../../../client/ui-im/src/client/locales.ts'
import {
  conversationMessagesFromRecords,
  IM_LIVE_LANE_BEHAVIORS,
  type ImDomainConversationRecord,
} from '../../../client/ui-im/src/client/presentation.ts'

const backendFixtureUrl = pathToFileURL(join(import.meta.dirname, 'memory-backend-fixture.ts')).href
const driverPath = join(import.meta.dirname, 'fixtures/assembled-driver.ts')
const repoRoot = join(import.meta.dirname, '../../../..')
const tsconfigPath = join(repoRoot, 'tsconfig.json')
const tsxLoader = import.meta.resolve('tsx/esm')
const t = makeTranslate(zh)

const roots: string[] = []
afterEach(async () => {
  cleanup()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('IM takeover keyless assembled acceptance', () => {
  it('proves routing, triggers, sender classes, path parity, stop, and Sidebar presentation', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-im-assembled-'))
    roots.push(tempDir)
    const storageFile = join(tempDir, 'storage.json')
    const configPath = join(tempDir, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-storage'",
      `- name: '${backendFixtureUrl}'`,
      "- name: '@deepseek-ai/dsh-storage-domain'",
      '  config:',
      "    backend: 'memory'",
      "- name: '@deepseek-ai/dsh-im-core'",
      "- name: '@deepseek-ai/dsh-im-core/delivery'",
      "- name: '@deepseek-ai/dsh-im-core/coordination'",
      "- name: '@deepseek-ai/dsh-im-core/simulation'",
      "- name: '@deepseek-ai/dsh-im-dingtalk'",
      '  config:',
      "    dwsPath: 'dws'",
      "    profile: 'testCorp'",
      '',
    ].join('\n'))

    const result = spawnSync(process.execPath, ['--import', tsxLoader, driverPath, configPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: tsconfigPath,
        DSH_IM_TEST_STORAGE_FILE: storageFile,
      },
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(`Assembled driver failed (exit ${String(result.status)}): ${result.stderr || result.stdout}`)
    }

    const report = JSON.parse(await readFile(join(tempDir, 'assembled-report.json'), 'utf8')) as {
      route: { status: string; workspaceId: string; enabled: boolean; groupTrigger: { mention: boolean } }
      testedWorkspaceId: string
      memberSender: string
      humanSender: string
      triggered: boolean
      triggerReason: string
      modelRequests: number
      simSendStatus: string
      argvAfterSim: number
      realSendStatus: string
      groupSendArgv: string[]
      unknownStatus: string
      unknownSent: boolean
      stoppedStatus: string
      stopError: string
      secondSender: string
      simHistory: ImDomainConversationRecord[]
      simOutbound: ImDomainConversationRecord
      unknownOutbound: ImDomainConversationRecord
    }

    expect(report.route).toMatchObject({
      status: 'matched', workspaceId: 'ws-tested', enabled: true, groupTrigger: { mention: true },
    })
    expect(report.testedWorkspaceId).toBe('ws-tested')
    expect(report.memberSender).toBe('external')
    expect(report.humanSender).toBe('human_dsh')
    expect(report.triggered).toBe(true)
    expect(report.triggerReason).toBe('mention')
    expect(report.modelRequests).toBeGreaterThan(0)
    expect(report.simSendStatus).toBe('sent')
    expect(report.argvAfterSim).toBe(0)
    expect(report.realSendStatus).toBe('sent')
    expect(report.groupSendArgv).toEqual(expect.arrayContaining(['--group', '度假开发联调群']))
    expect(report.unknownStatus).toBe('result_unknown')
    expect(report.unknownSent).toBe(false)
    expect(report.stoppedStatus).toBe('stopped')
    expect(report.stopError).toMatch(/stopped/)
    expect(report.secondSender).toBe('external')

    const store = createImGuiStore({
      ...emptyGuiSnapshot(),
      conversation: {
        title: '度假开发联调群',
        accountName: 'Assembled DingTalk',
        panel: 'live',
        role: 'tested',
        unconfigured: false,
        messages: conversationMessagesFromRecords([
          ...report.simHistory.filter(row => row.sender !== 'ai_outbound'),
          report.simOutbound,
          report.unknownOutbound,
        ]),
      },
    })
    const face = createImGuiFace(store)
    const conversation = {
      t, close: () => {}, useGui: bindSnapshotSelector(store),
      connect: face.connect, setPaused: face.setPaused, disconnect: face.disconnect,
      saveRoute: face.saveRoute, setRouteEnabled: face.setRouteEnabled,
      setSimulationTarget: face.setSimulationTarget, manualSend: face.manualSend,
      setPanel: face.setPanel, setRole: face.setRole,
    } as unknown as ConversationTabProps
    render(<ConversationTab {...conversation} />)
    expect(screen.getByText(zh.senderExternal)).toBeTruthy()
    expect(screen.getByText(zh.senderDsh)).toBeTruthy()
    expect(screen.getAllByText(zh.senderAi).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-delivery="result_unknown"]')?.textContent).toBe(zh.deliveryUnknown)
    expect(store.getSnapshot().conversation.messages.some(row => row.delivery === 'result_unknown')).toBe(true)
    expect(store.getSnapshot().conversation.messages.some(row => row.sender === 'ai_outbound' && row.delivery === 'sent')).toBe(true)
    expect(IM_LIVE_LANE_BEHAVIORS).toHaveLength(5)
  })
})

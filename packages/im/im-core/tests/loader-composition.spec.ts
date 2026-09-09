/**
 * REAL Loader composition test for @deepseek-ai/dsh-im-core:
 * Boots a keyless cordis.yml through the real Cordis Loader and StorageDomain,
 * proving configured accounts, route rules, simulation target gating, and persistence reload.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import ImConfigService from '../src/index.ts'
import type { ImAccountId, ImRouteRuleId } from '../src/types.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const loaded of contexts.splice(0).reverse()) await loaded.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

interface BootResult {
  readonly context: Context
  readonly service: ImConfigService
}

async function bootGeneration(storageRoot: string): Promise<BootResult> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-im-composition-'))
  roots.push(root)
  const configPath = join(root, 'cordis.yml')

  const yml = [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    '  config:',
    `    root: '${storageRoot}'`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    "    backend: 'json'",
    "- name: '@deepseek-ai/dsh-im-core'",
    '',
  ].join('\n')
  await writeFile(configPath, yml)

  const context = new Context()
  contexts.push(context)
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include

  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-im-core', ImConfigService],
  ])

  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>

  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()

  const service = context.get('imConfig') as ImConfigService
  expect(service).toBeDefined()
  return { context, service }
}

describe('im-core real Loader cordis.yml composition and persistence reload', () => {
  it('boots through real cordis.yml Loader, persists config, and reloads across two generations', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-im-storage-root-'))
    roots.push(storageRoot)

    // Generation 1
    const gen1 = await bootGeneration(storageRoot)
    const service1 = gen1.service

    const accountId = brandString<ImAccountId>('acc-loader-dt')
    await service1.upsertAccount({
      id: accountId,
      platform: 'dingtalk',
      displayName: 'Loader DingTalk Account',
      credentialRef: brandString<CredentialRef>('CRED_LOADER_TOKEN'),
      status: 'connected',
      paused: false,
    })

    const ws1 = brandString<WorkspaceId>('ws-loader-1')
    const ruleId = brandString<ImRouteRuleId>('rule-loader-1')
    await service1.createRouteRule({
      id: ruleId,
      accountId,
      conversationKind: 'group',
      target: { kind: 'all' },
      workspaceId: ws1,
      enabled: true,
      groupTrigger: {
        mention: true,
        everyN: 3,
      },
    })

    await service1.setSimulationConfig({
      workspaceId: ws1,
      targetAccountId: accountId,
      conversationKind: 'group',
    })

    // Validate generation 1 route resolution
    const resolvedGen1 = await service1.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'group-dyn-101',
    })
    expect(resolvedGen1).toEqual({
      status: 'matched',
      ruleId,
      workspaceId: ws1,
      enabled: true,
      groupTrigger: {
        mention: true,
        everyN: 3,
      },
    })

    // Dispose generation 1
    await gen1.context.fiber.dispose()

    // Generation 2: new process / Loader generation reading the same storageRoot
    const gen2 = await bootGeneration(storageRoot)
    const service2 = gen2.service

    const accountGen2 = await service2.getAccount(accountId)
    expect(accountGen2).toMatchObject({
      id: accountId,
      displayName: 'Loader DingTalk Account',
      credentialRef: 'CRED_LOADER_TOKEN',
    })

    const ruleGen2 = await service2.getRouteRule(ruleId)
    expect(ruleGen2).toMatchObject({
      id: ruleId,
      workspaceId: ws1,
      groupTrigger: {
        mention: true,
        everyN: 3,
      },
    })

    const simGen2 = await service2.getSimulationConfig(ws1)
    expect(simGen2).toMatchObject({
      workspaceId: ws1,
      targetAccountId: accountId,
    })

    // Resolve on reloaded generation
    const resolvedGen2 = await service2.resolveRoute({
      accountId,
      conversationKind: 'group',
      conversationId: 'group-dyn-102',
    })
    expect(resolvedGen2).toEqual({
      status: 'matched',
      ruleId,
      workspaceId: ws1,
      enabled: true,
      groupTrigger: {
        mention: true,
        everyN: 3,
      },
    })
  })
})

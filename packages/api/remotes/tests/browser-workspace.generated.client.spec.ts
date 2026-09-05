import { mkdirSync, writeFileSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { Context } from '@deepseek-ai/cordis'
import BrowserRuntimeDeterministic from '@deepseek-ai/dsh-browser-runtime-deterministic'
import BrowserWorkspaceBinder from '@deepseek-ai/dsh-browser-workspace'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { apply as applyClientRemote, inject as clientRemoteInject } from '@deepseek-ai/dsh-api-gateway/client'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { apply as applyAssembly, inject as assemblyInject } from '../src/client/index.ts'

const contexts: Context[] = []
const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const hostArtifact = join(workspaceRoot, 'packages/browser/browser-workspace/lib/typert.host.js')

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PAGE_URL = 'https://alpha.test/'
const PAGES = [
  { url: PAGE_URL, title: 'Alpha', text: 'alpha', screenshotPngBase64: PNG },
]

const ASSEMBLY_REMOTE_PACKAGES = [
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-api-settings-controller',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-host-plugin-inventory',
  '@deepseek-ai/dsh-member-question-receiver',
  '@deepseek-ai/dsh-message-feedback',
  '@deepseek-ai/dsh-session-reference',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-browser-workspace',
] as const

beforeAll(() => {
  const artifacts = new WorkspaceTypertGenerator(workspaceRoot)
    .generate([...ASSEMBLY_REMOTE_PACKAGES], ['host'])
  for (const artifact of artifacts) {
    const output = join(workspaceRoot, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    if (artifact.remote === undefined) {
      throw new Error(`${artifact.packageRoot} Host face emitted no Remote client artifact`)
    }
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}, 120_000)

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
})

async function requireHostContribution(): Promise<TypertContribution> {
  const remoteArtifact = join(workspaceRoot, 'packages/browser/browser-workspace/lib/typert.remote-client.js')
  await access(hostArtifact)
  await access(remoteArtifact)
  const host = await import(pathToFileURL(hostArtifact).href) as { TYPERT: TypertContribution }
  return host.TYPERT
}

function connectionTo(host: Context) {
  return {
    registerGenerationSource: () => () => {},
    start: () => ({ stop() {} }),
    rpc: {
      call: async (
        _channel: string,
        endpoint: string,
        payload: { readonly args: Record<string, unknown> },
        signal: AbortSignal,
      ) => {
        const [namespace, method] = endpoint.split('/')
        if (namespace === undefined || method === undefined) {
          throw new Error(`invalid Remote endpoint ${JSON.stringify(endpoint)}`)
        }
        try {
          const value = await host.typertGateway.invoke({
            namespace,
            method,
            args: payload.args,
            signal,
          })
          return { ok: true as const, value }
        } catch (error) {
          const failure = remoteErrorOf(error)
          if (failure === undefined) {
            return {
              ok: false as const,
              error: {
                code: 'gateway/internal',
                message: error instanceof Error ? error.message : String(error),
                details: {},
              },
            }
          }
          return {
            ok: false as const,
            error: { code: failure.code, message: failure.message, details: failure.details },
          }
        }
      },
    },
  }
}

async function createGeneratedHost(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
  await ctx.plugin(TypertRegistry)
  ctx.typert.register(await requireHostContribution())
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(BrowserWorkspaceBinder)
  return ctx
}

async function createAssemblyClient(host: Context): Promise<Context> {
  const client = new Context()
  contexts.push(client)
  await client.plugin(TypertRegistry)
  client.provide('connection', connectionTo(host) as never)
  await client.plugin({ inject: [...clientRemoteInject], apply: applyClientRemote })
  await client.plugin({ inject: [...assemblyInject], apply: applyAssembly }).await()
  return client
}

describe('assembled Browser Workspace Remote', () => {
  it('mounts generated browserWorkspace and observes a Session-owned tab from the Client', async () => {
    const host = await createGeneratedHost()
    const session = host.sessions.create(SessionId('session-assembly'))
    const created = await host.browserWorkspace.create({ session, profile: 'temporary' })
    const client = await createAssemblyClient(host)
    const opened = await client.remote.browserWorkspace.navigate(
      session.id,
      created.target,
      created.revision,
      PAGE_URL,
    )
    expect(opened).toMatchObject({ ok: true, value: { status: 'open', target: created.target, url: PAGE_URL } })
    if (opened.ok !== true) throw new Error('navigate did not open the deterministic page')
    await expect(client.remote.browserWorkspace.observe(session.id, created.target))
      .resolves.toMatchObject({ ok: true, value: { status: 'open', target: created.target } })
    await expect(client.remote.browserWorkspace.screenshot(session.id, created.target))
      .resolves.toMatchObject({ ok: true, value: { target: created.target, mediaType: 'image/png' } })
    await expect(client.remote.browserWorkspace.focus(session.id, created.target, opened.value.revision))
      .resolves.toMatchObject({ ok: true, value: { status: 'open', target: created.target } })
  })

  it('rejects Client verbs after the assembly unloads and remounts the namespace', async () => {
    const host = await createGeneratedHost()
    const session = host.sessions.create(SessionId('session-unmount'))
    const created = await host.browserWorkspace.create({ session, profile: 'temporary' })
    const client = new Context()
    contexts.push(client)
    await client.plugin(TypertRegistry)
    client.provide('connection', connectionTo(host) as never)
    await client.plugin({ inject: [...clientRemoteInject], apply: applyClientRemote })
    const fiber = client.plugin({ inject: [...assemblyInject], apply: applyAssembly })
    await fiber.await()
    await expect(client.remote.browserWorkspace.observe(session.id, created.target))
      .resolves.toMatchObject({ ok: true })
    await fiber.dispose()
    expect(client.get('remote.browserWorkspace')).toBeUndefined()
    const remount = client.plugin({ inject: [...assemblyInject], apply: applyAssembly })
    await remount.await()
    await expect(client.remote.browserWorkspace.observe(session.id, created.target))
      .resolves.toMatchObject({ ok: true })
  })
})

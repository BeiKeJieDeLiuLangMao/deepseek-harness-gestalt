import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as SchedulePlugin from '@deepseek-ai/dsh-schedule'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function includeTree(ctx: Context): Include {
  const include = [...ctx.loader.entries()]
    .find(entry => entry.options.name === 'cordis:include')?.subtree as Include | undefined
  if (include === undefined) throw new Error('expected the root Include tree')
  return include
}

function scheduleEntry(ctx: Context) {
  const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === '@deepseek-ai/dsh-schedule')
  if (entry === undefined) throw new Error('expected the public schedule Loader entry')
  return entry
}

const BASE_ROWS = [
  '- id: llm',
  "  name: '@deepseek-ai/dsh-llm'",
  '- id: session',
  "  name: '@deepseek-ai/dsh-session'",
  '- id: system-prompt',
  "  name: '@deepseek-ai/dsh-system-prompt'",
  '- id: tools',
  "  name: '@deepseek-ai/dsh-tools'",
  '- id: agent',
  "  name: '@deepseek-ai/dsh-agent'",
  '- id: session-projection',
  "  name: '@deepseek-ai/dsh-session-projection'",
  '- id: session-persistence-jsonl',
  "  name: '@deepseek-ai/dsh-session-persistence-jsonl'",
  '  config:',
  '    root: SESSIONS_ROOT',
  '    compression: none',
  '- id: agent-loop',
  "  name: '@deepseek-ai/dsh-agent-loop'",
  '  config:',
  '    agents:',
  '      - id: existing',
  '        sessionId: schedule-existing',
  '        provider: mock',
  '        model: mock',
] as const

function scheduleChanges(agent: { session: { snapshotEvents: () => readonly { type: string }[] } }) {
  return agent.session.snapshotEvents().filter(event => event.type === 'schedule/change')
}

async function execute(
  ctx: Context,
  agent: { id: string },
  name: string,
  args: Record<string, unknown>,
  callId: string,
) {
  return ctx.agents.withInitiator(agent, () => ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(callId),
    name,
    arguments: args,
    agent,
  }))
}

function compositionYaml(sessionsRoot: string, withSchedule: boolean): string {
  const rows = BASE_ROWS.map(line => line === '    root: SESSIONS_ROOT' ? `    root: ${JSON.stringify(sessionsRoot)}` : line)
  if (withSchedule) {
    rows.push('- id: schedule')
    rows.push("  name: '@deepseek-ai/dsh-schedule'")
  }
  return `${rows.join('\n')}\n`
}

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-schedule-loader-'))
  const sessionsRoot = join(root, 'sessions')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, compositionYaml(sessionsRoot, false))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = `${pathToFileURL(root).href}/`
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-session-persistence-jsonl', JsonlSessionPersistence],
    ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ['@deepseek-ai/dsh-schedule', SchedulePlugin],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  const existingId = SessionId('schedule-existing')
  await expect.poll(() => ctx.agents.get(existingId), { timeout: 5_000 }).toBeDefined()
  await writeFile(configPath, compositionYaml(sessionsRoot, true))
  await includeTree(ctx).refresh()
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  expect(scheduleEntry(ctx).options.name).toBe('@deepseek-ai/dsh-schedule')
  return ctx
}

describe('Schedule real Loader composition through cordis.yml', () => {
  it('loads the public namespace, manages reminders on future roots, and unregisters on fiber dispose', async () => {
    const ctx = await boot()
    const existing = ctx.agents.get(SessionId('schedule-existing'))
    expect(existing).toBeDefined()
    if (existing === undefined) throw new Error('expected the configured existing root')
    expect(ctx.tools.get('schedule_create', existing)).toBeUndefined()
    expect(ctx.tools.get('schedule_list', existing)).toBeUndefined()
    expect(ctx.tools.get('schedule_delete', existing)).toBeUndefined()
    expect(ctx.tools.get('schedule_create')).toBeUndefined()

    const root = await ctx.agents.create({ sessionId: SessionId('schedule-root') })
    expect(ctx.tools.get('schedule_create', root.agent)?.name).toBe('schedule_create')
    expect(ctx.tools.get('schedule_list', root.agent)?.name).toBe('schedule_list')
    expect(ctx.tools.get('schedule_delete', root.agent)?.name).toBe('schedule_delete')
    expect(ctx.tools.get('schedule_create')).toBeUndefined()

    const created = await execute(ctx, root.agent, 'schedule_create', {
      prompt: 'loader reminder',
      after_seconds: 3_600,
    }, 'schedule-loader-create')
    expect(created.isError).toBe(false)
    if (created.isError) throw new Error('expected Schedule create value')
    expect(created.value).toMatchObject({ id: 'schedule-1', deliveryMode: 'session-local' })
    expect(scheduleChanges(root.agent)).toEqual([
      expect.objectContaining({
        type: 'schedule/change',
        data: expect.objectContaining({
          version: 1,
          operation: 'create',
          schedule: expect.objectContaining({ id: 'schedule-1', prompt: 'loader reminder' }),
        }),
      }),
    ])

    const listed = await execute(ctx, root.agent, 'schedule_list', {}, 'schedule-loader-list')
    expect(listed.isError).toBe(false)
    if (listed.isError) throw new Error('expected Schedule list value')
    expect(listed.value).toEqual([expect.objectContaining({ id: 'schedule-1', prompt: 'loader reminder' })])

    const deleted = await execute(ctx, root.agent, 'schedule_delete', { id: 'schedule-1' }, 'schedule-loader-delete')
    expect(deleted.isError).toBe(false)
    if (deleted.isError) throw new Error('expected Schedule delete value')
    expect(deleted.value).toEqual({ id: 'schedule-1', deleted: true })
    expect(scheduleChanges(root.agent).map(event => event.type === 'schedule/change' ? event.data.operation : undefined))
      .toEqual(['create', 'delete'])

    const child = await root.agent.ctx.agents.create({ sessionId: SessionId('schedule-child') })
    expect(ctx.tools.get('schedule_create', child.agent)).toBeUndefined()

    const entry = scheduleEntry(ctx)
    await entry.fiber!.dispose()
    expect(ctx.tools.get('schedule_create', root.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_list', root.agent)).toBeUndefined()
    expect(ctx.tools.get('schedule_delete', root.agent)).toBeUndefined()

    await child.dispose()
    await root.dispose()
  }, 30_000)
})

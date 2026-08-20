import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { spawnHarness, waitForIdle } from './harness.ts'
import { SessionId } from '@deepseek-ai/dsh-session'

/** Key-gated smoke for a real parent delegating filesystem work to a real child. */

let ctx: Context | undefined
let workdir: string | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (workdir !== undefined) await rm(workdir, { recursive: true, force: true })
  workdir = undefined
})

const home = process.env.DSH_HOME

describe.skipIf(home === undefined)('spawn backend with-key smoke', () => {
  it('a parent delegates to a child that writes a file on disk', async () => {
    workdir = await mkdtemp(join(tmpdir(), 'dsh-subagent-spawn-e2e-'))
    ctx = await spawnHarness(workdir, home!)
    const parent = ctx.agentLoop.create(SessionId('e2e-parent'), { provider: 'grok', model: 'grok-4.6' })

    const idle = waitForIdle(ctx, parent)
    parent.followup(createUserMessage({
      content: [{ type: 'text', text:
      'Use the subagent tool to delegate this exact task: "Use the bash tool to write the text '
      + 'SUBAGENT_WAS_HERE into a file named proof.txt in the current directory." '
      + 'After the subagent finishes, tell me it is done.' }], source: { kind: 'user' } }))
    await idle

    const events = [...parent.session.events]
    const summary = events.map((e) => {
      if (e.type === 'turn/end') return `turn/end:${JSON.stringify(e.data.reason)}`
      if (e.type === 'tool/call') return `tool/call:${e.data.name}`
      return e.type
    }).join(',')

    // Assert the filesystem effect independently of the model response.
    const proof = await readFile(join(workdir, 'proof.txt'), 'utf8').catch((error: unknown) => {
      throw new Error(`proof.txt missing (${summary}): ${String(error)}`)
    })
    expect(proof).toContain('SUBAGENT_WAS_HERE')

    // The parent's log records the subagent tool/call + its result (not the
    // child's internal steps).
    const subagentCalls = events.filter(e => e.type === 'tool/call' && e.data.name === 'subagent')
    expect(subagentCalls.length, summary).toBeGreaterThan(0)
  }, 180_000)

  it('a parent on grok can send a child to gestalt-openai', async () => {
    workdir = await mkdtemp(join(tmpdir(), 'dsh-subagent-spawn-route-e2e-'))
    ctx = await spawnHarness(workdir, home!)
    const parent = ctx.agentLoop.create(SessionId('e2e-route-parent'), {
      provider: 'grok',
      model: 'grok-4.6',
    })
    const childRoutes: Array<{ provider?: string; model?: string }> = []
    ctx.on('subagent/end', (info) => {
      const child = ctx?.agents.get(info.id)
      const config = child?.session.requestHeader()?.config
      if (config !== undefined) childRoutes.push({ provider: config.provider, model: config.model })
    })

    const idle = waitForIdle(ctx, parent)
    parent.followup(createUserMessage({
      content: [{
        type: 'text',
        text:
          'Call the subagent tool once with provider set to exactly gestalt-openai '
          + 'and model set to exactly gpt-5.6-sol. '
          + 'The subagent prompt must be: "Reply with exactly the word CHILD_ROUTE and nothing else." '
          + 'Do not omit those two arguments. After the subagent finishes, reply with its result.',
      }],
      source: { kind: 'user' },
    }))
    await idle

    const parentHeader = parent.session.requestHeader()?.config
    expect(parentHeader?.provider).toBe('grok')
    expect(parentHeader?.model).toBe('grok-4.6')
    const events = [...parent.session.events]
    const summary = events.map((e) => {
      if (e.type === 'turn/end') return `turn/end:${JSON.stringify(e.data.reason)}`
      if (e.type === 'tool/call') return `tool/call:${e.data.name}`
      return e.type
    }).join(',')
    const call = events.find(e => e.type === 'tool/call' && e.data.name === 'subagent')
    expect(call?.type, summary).toBe('tool/call')
    if (call?.type !== 'tool/call') throw new Error('expected a subagent tool call')
    expect(String(call.data.arguments)).toContain('gestalt-openai')
    expect(String(call.data.arguments)).toContain('gpt-5.6-sol')
    expect(childRoutes).toContainEqual({ provider: 'gestalt-openai', model: 'gpt-5.6-sol' })
  }, 180_000)
})

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { assertFixtureInventory, launchWebScaffold, type WebScaffold } from './scaffold.ts'

const DESKTOP_OVERLAY = fileURLToPath(new URL('../../desktop/cordis.patch.yml', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/desktop-schedule', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const PROMPT = 'List the reminders in this Desktop Session, then reply exactly NO_REMINDERS and stop.'

/** Extract text from one durable assistant message. */
function assistantText(event: SessionEvent<'assistant/message'>): string {
  return event.data.message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

describe('Desktop default Schedule turn', () => {
  let scaffold: WebScaffold
  let agentHandle: AgentHandle

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: DESKTOP_OVERLAY,
      replayFixture: FIXTURE,
    })
    agentHandle = await scaffold.ctx.agents.create({
      sessionId: SessionId('desktop-schedule-snapshot'),
      meta: { cwd: scaffold.workspaceCwd },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup: agentCtx => scaffold.ctx.agentPresets.mount(agentCtx).then(() => undefined),
    })
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await agentHandle?.dispose().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Desktop Schedule snapshot teardown failed')
  })

  it('records the Schedule call and result, and the final answer', async () => {
    agentHandle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: PROMPT }],
      source: { kind: 'user' },
    }))
    await agentHandle.agent.whenIdle()

    const events = agentHandle.agent.session.events
    expect(events.some(event =>
      event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'time-context')).toBe(false)
    const scheduleCalls = events.filter(
      (event): event is SessionEvent<'tool/call'> => event.type === 'tool/call'
        && event.data.name.startsWith('schedule_'),
    )
    const listCall = scheduleCalls.find(event => event.data.name === 'schedule_list')
    if (listCall === undefined) throw new Error('the replayed Desktop turn did not call schedule_list')
    const listResult = events.find(event => event.type === 'tool/result'
      && event.data.message.source.callId === listCall.data.callId)
    if (listResult?.type !== 'tool/result') throw new Error('schedule_list produced no durable result')
    const finalAssistant = events.findLast(
      (event): event is SessionEvent<'assistant/message'> => event.type === 'assistant/message',
    )
    if (finalAssistant === undefined) throw new Error('the replayed Desktop turn produced no assistant reply')
    const requestHeader = agentHandle.agent.session.requestHeader()
    if (requestHeader === undefined) throw new Error('the replayed Desktop turn issued no model request')

    expect({
      prompt: PROMPT,
      scheduleTools: requestHeader.tools
        ?.map(tool => tool.name)
        .filter(name => name.startsWith('schedule_'))
        .sort(),
      toolCall: { name: listCall.data.name, arguments: listCall.data.arguments },
      toolResult: listResult.data.message.content[0]?.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join(''),
      assistant: assistantText(finalAssistant),
    }).toMatchInlineSnapshot(`
      {
        "assistant": "NO_REMINDERS",
        "prompt": "List the reminders in this Desktop Session, then reply exactly NO_REMINDERS and stop.",
        "scheduleTools": [
          "schedule_create",
          "schedule_delete",
          "schedule_list",
        ],
        "toolCall": {
          "arguments": "{}",
          "name": "schedule_list",
        },
        "toolResult": "[]",
      }
    `)
    expect(scheduleCalls).toHaveLength(1)
    expect(listResult.data.message.content[0]?.isError).toBe(false)
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.jsonl'])
  })
})

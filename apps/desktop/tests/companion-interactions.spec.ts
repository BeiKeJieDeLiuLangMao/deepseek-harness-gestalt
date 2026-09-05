import { describe, expect, it } from 'vitest'
import type { RemoteEventClientId, RemoteEventId } from '@deepseek-ai/dsh-api-gateway'
import { parseCompanionSessionId } from '@deepseek-ai/dsh-remote-protocol'
import { DesktopCompanionInteractionRegistry } from '../src/companion-interactions.ts'

describe('Desktop Companion pending interactions', () => {
  it('projects pairing-private Ask User and Approval ids from $events waterfalls and drops cancel', () => {
    const registry = new DesktopCompanionInteractionRegistry()
    registry.ready({
      type: 'ready',
      clientId: 'client-generation' as RemoteEventClientId,
      host: { home: '/tmp' },
    })
    registry.accept({
      type: 'waterfall',
      event: 'approval/request',
      eventId: 'event-approval' as RemoteEventId,
      agentId: 'session-interaction' as never,
      request: { toolName: 'bash', reason: 'needs permission' },
    })
    registry.accept({
      type: 'waterfall',
      event: 'user-questions/request',
      eventId: 'event-question' as RemoteEventId,
      agentId: 'session-interaction' as never,
      request: { questions: [{ id: 'q1', question: 'Continue?', options: [{ label: 'Yes' }] }] },
    })
    const key = Uint8Array.from({ length: 32 }, (_, index) => index)
    const projected = registry.project(parseCompanionSessionId('session-interaction'), key)
    expect(projected).toHaveLength(2)
    expect(projected.map(item => item.interactionId)).not.toContain('event-approval')
    expect(registry.resolve(projected[0]!.interactionId, key)).toMatchObject({ eventId: 'event-approval' })

    registry.accept({ type: 'cancel', eventId: 'event-approval' as RemoteEventId })
    expect(registry.project(parseCompanionSessionId('session-interaction'), key)).toHaveLength(1)
  })
})

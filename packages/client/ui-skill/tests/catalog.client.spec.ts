/**
 * Skill directory uses ISessions.skillCatalogSessionId for display list only.
 * Host skills/list is addressed at that identity; a missing helper hides
 * skills; a failed list is an error.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ClientSessions } from '../../../api/session-controller/src/client/sessions/service.ts'
import { FakeApiClient, fakeRemote, ok } from '../../../api/session-controller/tests/fake-api.client.ts'
import { loadSkillCatalog } from '../src/client/catalog.ts'

const sid = (value: string): SessionId => value as SessionId

const PARENT = [
  { name: 'parent-skill', description: 'from parent', modelInvocable: true },
]
const CHILD = [
  { name: 'child-skill', description: 'from child', modelInvocable: true },
]

describe('loadSkillCatalog', () => {
  it('lists the parent catalog for a draft Side Chat and leaves ordinary Sessions on self', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const svc = new ClientSessions(ctx, fakeRemote(api))
    const parentId = sid('session-parent')
    const childId = sid('session-sidechat')
    const ordinaryId = sid('session-ordinary')
    api.onList = () => Promise.resolve(ok({
      items: [
        { sessionId: parentId, updatedAt: 1, running: false, blank: false },
        { sessionId: ordinaryId, updatedAt: 1, running: false, blank: false },
      ],
    }))
    await svc.refresh()
    svc.stageProvisional({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })
    const listed: SessionId[] = []
    const skills = {
      list: async (payload: { sessionId: SessionId }) => {
        listed.push(payload.sessionId)
        return {
          ok: true as const,
          value: { skills: payload.sessionId === parentId ? PARENT : CHILD },
        }
      },
    }
    svc.registerAdmission(childId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      skillCatalogSessionId: () => parentId,
    })

    await expect(loadSkillCatalog(svc, skills, childId)).resolves.toEqual(PARENT)
    await expect(loadSkillCatalog(svc, skills, ordinaryId)).resolves.toEqual(CHILD)
    expect(listed).toEqual([parentId, ordinaryId])
  })

  it('hides skills when the helper is omitted and throws on a failed Host list', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const svc = new ClientSessions(ctx, fakeRemote(api))
    const childId = sid('session-feature')
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId: childId, updatedAt: 1, running: false, blank: false }],
    }))
    await svc.refresh()
    svc.registerAdmission(childId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
    })
    const skills = {
      list: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'gateway/internal', message: 'loader missing' },
      })),
    }
    await expect(loadSkillCatalog(svc, skills, childId)).resolves.toEqual([])
    expect(skills.list).not.toHaveBeenCalled()

    const drop = svc.registerAdmission(childId, {
      prompt: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      cancel: vi.fn(() => Promise.resolve(ok({ accepted: true as const }))),
      skillCatalogSessionId: () => childId,
    })
    await expect(loadSkillCatalog(svc, skills, childId))
      .rejects.toThrow('skills/list failed: gateway/internal: loader missing')
    drop()
    await expect(loadSkillCatalog(svc, skills, childId))
      .rejects.toThrow('skills/list failed: gateway/internal: loader missing')
  })
})

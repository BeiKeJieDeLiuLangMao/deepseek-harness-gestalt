/** Fixture Browser Workspace remotes: Dock open/collapse and page observation. */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '../src/client/api.ts'
import { createFixtureFaces } from '../src/client/fixture.ts'

const sid = (id: string): SessionId => id as SessionId
const TARGET = {
  profileId: 'fx-profile',
  workspaceId: 'fx-workspace',
  browserId: 'fx-browser',
  tabId: 'fx-tab',
}

async function callRemote<T>(
  rpc: ReturnType<typeof createFixtureFaces>['rpc'],
  endpoint: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await rpc.call('/api', endpoint, { args })
  if (!result.ok) throw new Error(`${endpoint} failed: ${result.error.code}`)
  return result.value as T
}

describe('createFixtureFaces browserWorkspace remotes', () => {
  it('opens, observes, takes over, and collapses the Dock for the addressed Session', async () => {
    const { rpc } = createFixtureFaces()
    const opened = await callRemote<{ dockOpen: boolean; dockWidth: number; userCollapsed: boolean }>(
      rpc, 'browserWorkspace/setDock', { agentId: sid('fx-alpha'), request: { open: true, width: 720 } })
    expect(opened).toMatchObject({ dockOpen: true, dockWidth: 720, userCollapsed: false })

    const observed = await callRemote<{ status: string; title: string }>(
      rpc, 'browserWorkspace/observe', { agentId: sid('fx-alpha'), target: TARGET })
    expect(observed).toMatchObject({ status: 'open', title: 'Example Domain' })

    const shot = await callRemote<{ mediaType: string }>(
      rpc, 'browserWorkspace/screenshot', { agentId: sid('fx-alpha'), target: TARGET })
    expect(shot.mediaType).toBe('image/png')

    const taken = await callRemote<{ controlOwner: string }>(
      rpc, 'browserWorkspace/takeover', { agentId: sid('fx-alpha'), target: TARGET, expectedRevision: 1 })
    expect(taken.controlOwner).toBe('human')

    const returned = await callRemote<{ controlOwner: string }>(
      rpc, 'browserWorkspace/returnControl', { agentId: sid('fx-alpha'), target: TARGET, expectedRevision: 2 })
    expect(returned.controlOwner).toBe('agent')

    const collapsed = await callRemote<{ dockOpen: boolean; userCollapsed: boolean }>(
      rpc, 'browserWorkspace/setDock', { agentId: sid('fx-alpha'), request: { open: false } })
    expect(collapsed).toMatchObject({ dockOpen: false, userCollapsed: true })

    const focused = await callRemote<{ focused: boolean; revision: number }>(
      rpc, 'browserWorkspace/focus', { agentId: sid('fx-alpha'), target: TARGET, expectedRevision: 3 })
    expect(focused).toMatchObject({ focused: true, revision: 4 })

    const navigated = await callRemote<{ url: string }>(
      rpc, 'browserWorkspace/navigate', {
        agentId: sid('fx-alpha'), target: TARGET, expectedRevision: 4, url: 'https://login.test/',
      })
    expect(navigated.url).toBe('https://login.test/')

    const closed = await callRemote<{ status: string }>(
      rpc, 'browserWorkspace/close', { agentId: sid('fx-alpha'), target: TARGET, expectedRevision: 5 })
    expect(closed.status).toBe('closed')

    const afterClose = await callRemote<{ status: string }>(
      rpc, 'browserWorkspace/observe', { agentId: sid('fx-alpha'), target: TARGET })
    expect(afterClose.status).toBe('closed')
  })

  it('rejects an unknown Session', async () => {
    const { rpc } = createFixtureFaces()
    const missing = await rpc.call('/api', 'browserWorkspace/observe', {
      args: { agentId: sid('fx-nope'), target: TARGET },
    })
    expect(missing).toMatchObject({ ok: false, error: { code: 'session-not-found' } })
  })
})

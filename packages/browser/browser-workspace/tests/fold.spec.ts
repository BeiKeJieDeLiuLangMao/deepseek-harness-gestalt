import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import { BrowserInstanceId, BrowserProfileId, BrowserTabId, BrowserWorkspaceId } from '@deepseek-ai/dsh-browser-runtime'
import { applyBrowserWorkspaceProjection, EMPTY_BROWSER_WORKSPACE, foldBrowserWorkspace } from '../src/fold.ts'
import type { BrowserWorkspaceProjection } from '../src/client.ts'

const SNAPSHOT: BrowserWorkspaceProjection = {
  activeWorkspaceId: BrowserWorkspaceId('ws-1'),
  workspaces: [{
    workspaceId: BrowserWorkspaceId('ws-1'),
    profileId: BrowserProfileId('profile-1'),
    activeBrowserId: BrowserInstanceId('browser-1'),
    browsers: [{
      browserId: BrowserInstanceId('browser-1'),
      activeTabId: BrowserTabId('tab-1'),
      tabs: [{ tabId: BrowserTabId('tab-1'), revision: 0 }],
    }],
  }],
}

describe('Browser Workspace fold', () => {
  it('returns the empty Workspace before any snapshot and last-wins after', () => {
    const session = Session.create(SessionId('fold-session'))
    expect(foldBrowserWorkspace(session.snapshotEvents())).toBe(EMPTY_BROWSER_WORKSPACE)
    session.append('browser/workspace', SNAPSHOT, { ignorable: true })
    expect(foldBrowserWorkspace(session.snapshotEvents())).toEqual(SNAPSHOT)
    const later = { ...SNAPSHOT, activeWorkspaceId: null }
    session.append('browser/workspace', later, { ignorable: true })
    expect(foldBrowserWorkspace(session.snapshotEvents())).toEqual(later)
    expect(foldBrowserWorkspace(session.snapshotEvents(), 0)).toBe(EMPTY_BROWSER_WORKSPACE)
  })

  it('folds only child-owned events after a fork-inherited prefix', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const parent = ctx.sessions.create(SessionId('fold-parent'))
    parent.append('turn/start', { turn: 1 })
    parent.append('turn/end', { turn: 1 })
    parent.append('browser/workspace', SNAPSHOT, { ignorable: true })
    const child = ctx.sessions.fork(parent, parent.snapshotEvents().at(-1)!.seq, SessionId('fold-child'))
    expect(foldBrowserWorkspace(child.ownEvents())).toBe(EMPTY_BROWSER_WORKSPACE)
    expect(foldBrowserWorkspace(child.snapshotEvents())).toEqual(SNAPSHOT)
    const childOwned = { ...SNAPSHOT, activeWorkspaceId: null }
    child.append('browser/workspace', childOwned, { ignorable: true })
    expect(foldBrowserWorkspace(child.ownEvents())).toEqual(childOwned)
    expect(foldBrowserWorkspace(child.snapshotEvents())).toEqual(childOwned)
  })

  it('keeps the same projection reference for unrelated events', () => {
    const next = applyBrowserWorkspaceProjection(EMPTY_BROWSER_WORKSPACE, {
      type: 'turn/start',
      seq: 0,
      time: 0,
      data: { turn: 1 },
    })
    expect(next).toBe(EMPTY_BROWSER_WORKSPACE)
  })
})

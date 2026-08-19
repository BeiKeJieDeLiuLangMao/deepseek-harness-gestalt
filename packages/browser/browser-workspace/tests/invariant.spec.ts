import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import * as BrowserWorkspaceInvariant from '../src/invariant.ts'
import type { BrowserWorkspaceProjection } from '../src/types.ts'

const VALID: BrowserWorkspaceProjection = {
  dockOpen: false,
  dockWidth: 640,
  userCollapsed: false,
  activeWorkspaceId: null,
  workspaces: [],
}

describe('Browser Workspace invariant', () => {
  it('rejects an invalid Workspace snapshot before it reaches the log', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(BrowserWorkspaceInvariant)
    const session = ctx.sessions.create()
    expect(() => session.append('browser/workspace', {
      ...VALID,
      dockWidth: 0,
    })).toThrow(InvariantError)
    const invalid: unknown[] = [
      null,
      { ...VALID, dockOpen: 'yes' },
      { ...VALID, workspaces: 'no' },
      { ...VALID, workspaces: [null] },
      { ...VALID, workspaces: [{ workspaceId: '', profileId: 'p', activeBrowserId: null, browsers: [] }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: '', activeBrowserId: null, browsers: [] }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: 'no' }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [null] }] },
      { ...VALID, workspaces: [{
        workspaceId: 'ws',
        profileId: 'p',
        activeBrowserId: null,
        browsers: [
          { browserId: 'b', tabs: [{ tabId: 't', controlOwner: 'agent' }], activeTabId: 't' },
          { browserId: 'b', tabs: [{ tabId: 'u', controlOwner: 'agent' }], activeTabId: 'u' },
        ],
      }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [{ browserId: '', tabs: [], activeTabId: null }] }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [{ browserId: 'b', tabs: 'no', activeTabId: null }] }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [{ browserId: 'b', tabs: [null], activeTabId: null }] }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [{ browserId: 'b', tabs: [{ tabId: '' }], activeTabId: null }] }] },
      { ...VALID, workspaces: [{ workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [{ browserId: 'b', tabs: [{ tabId: 't', controlOwner: 'other' }], activeTabId: null }] }] },
      { ...VALID, workspaces: [{
        workspaceId: 'ws',
        profileId: 'p',
        activeBrowserId: null,
        browsers: [{ browserId: 'b', tabs: [{ tabId: 't', controlOwner: 'agent' }, { tabId: 't', controlOwner: 'agent' }], activeTabId: null }],
      }] },
      { ...VALID, workspaces: [{
        workspaceId: 'ws',
        profileId: 'p',
        activeBrowserId: null,
        browsers: [{ browserId: 'b', tabs: [{ tabId: 't', controlOwner: 'agent' }], activeTabId: 'missing' }],
      }] },
      { ...VALID, workspaces: [{
        workspaceId: 'ws',
        profileId: 'p',
        activeBrowserId: 'missing',
        browsers: [{ browserId: 'b', tabs: [{ tabId: 't', controlOwner: 'agent' }], activeTabId: 't' }],
      }] },
      { ...VALID, activeWorkspaceId: 'missing' },
      { ...VALID, workspaces: [
        { workspaceId: 'ws', profileId: 'p', activeBrowserId: null, browsers: [] },
        { workspaceId: 'ws', profileId: 'q', activeBrowserId: null, browsers: [] },
      ] },
    ]
    for (const value of invalid) {
      expect(() => session.append('browser/workspace', value as never)).toThrow(InvariantError)
    }
  })

  it('accepts a valid empty snapshot and disposes the companion', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(BrowserWorkspaceInvariant)
    const session = ctx.sessions.create()
    session.append('browser/workspace', VALID)
    expect(() => session.append('turn/start', { turn: 1 })).not.toThrow()
    const later = new Context()
    await later.plugin(SessionStore)
    later.sessions.create(SessionId('seeded'), { seed: session.events })
    await later.plugin(InvariantRegistry)
    await later.plugin(BrowserWorkspaceInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})

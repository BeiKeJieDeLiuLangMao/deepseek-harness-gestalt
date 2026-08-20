import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BrowserProfileName, BrowserTabId } from '@deepseek-ai/dsh-browser-runtime'
import BrowserRuntimeDeterministic from '@deepseek-ai/dsh-browser-runtime-deterministic'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import BrowserWorkspaceBinder from '@deepseek-ai/dsh-browser-workspace'
import * as BrowserWorkspaceInvariant from '../src/invariant.ts'
import { EMPTY_BROWSER_WORKSPACE, foldBrowserWorkspace } from '../src/fold.ts'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PAGES = [
  { url: 'https://alpha.test/', title: 'Alpha', text: 'alpha', screenshotPngBase64: PNG_1X1 },
  { url: 'https://beta.test/', title: 'Beta', text: 'beta', screenshotPngBase64: PNG_1X1 },
]

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
  await ctx.plugin(BrowserWorkspaceBinder)
  return ctx
}

describe('Session-owned Browser Workspace', () => {
  it('starts empty and remembers Dock open and width independently per Session', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-a'))
    const second = ctx.sessions.create(SessionId('session-b'))
    expect(ctx.browserWorkspace.snapshot(first)).toEqual(EMPTY_BROWSER_WORKSPACE)
    expect(ctx.sessionProjections.snapshot(first).values.browserWorkspace).toEqual(EMPTY_BROWSER_WORKSPACE)

    const opened = ctx.browserWorkspace.setDock({ session: first, open: true, width: 720 })
    expect(opened).toMatchObject({ dockOpen: true, dockWidth: 720, userCollapsed: false })
    expect(ctx.browserWorkspace.setDock({ session: first, open: true })).toMatchObject({ dockWidth: 720, userCollapsed: false })
    ctx.browserWorkspace.setDock({ session: second, open: false, width: 480 })
    expect(ctx.browserWorkspace.snapshot(first)).toMatchObject({ dockOpen: true, dockWidth: 720, userCollapsed: false })
    expect(ctx.browserWorkspace.snapshot(second)).toMatchObject({ dockOpen: false, dockWidth: 480, userCollapsed: true })
    expect(foldBrowserWorkspace(first.events)).toEqual(ctx.browserWorkspace.snapshot(first))
  })

  it('opens the Dock on the first Session tab and does not steal it open after collapse', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-first-open'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    expect(ctx.browserWorkspace.snapshot(session)).toMatchObject({
      dockOpen: true,
      userCollapsed: false,
      workspaces: [{ workspaceId: created.target.workspaceId }],
    })
    ctx.browserWorkspace.setDock({ session, open: false })
    expect(ctx.browserWorkspace.snapshot(session)).toMatchObject({ dockOpen: false, userCollapsed: true })
    await ctx.browserWorkspace.create({
      session,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: created.target.workspaceId, browserId: created.target.browserId },
    })
    expect(ctx.browserWorkspace.snapshot(session)).toMatchObject({ dockOpen: false, userCollapsed: true })
    ctx.browserWorkspace.setDock({ session, open: true, width: 800 })
    expect(ctx.browserWorkspace.snapshot(session)).toMatchObject({
      dockOpen: true,
      dockWidth: 800,
      userCollapsed: false,
    })
  })

  it('lets one Session own multiple Profiles, instances, and tabs without exposing another Session', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-a'))
    const second = ctx.sessions.create(SessionId('session-b'))

    const work = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('work'),
    })
    const personal = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('personal'),
    })
    const secondTab = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('work'),
      attach: { kind: 'browser', workspaceId: work.target.workspaceId, browserId: work.target.browserId },
    })
    const secondBrowser = await ctx.browserWorkspace.create({
      session: first,
      profile: 'persistent',
      name: BrowserProfileName('work'),
      attach: { kind: 'workspace', workspaceId: work.target.workspaceId },
    })
    expect(secondTab.target.workspaceId).toBe(work.target.workspaceId)
    expect(secondTab.target.browserId).toBe(work.target.browserId)
    expect(secondTab.target.tabId).not.toBe(work.target.tabId)
    expect(secondBrowser.target.workspaceId).toBe(work.target.workspaceId)
    expect(secondBrowser.target.browserId).not.toBe(work.target.browserId)

    await ctx.browserWorkspace.navigate({
      session: first,
      target: work.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    const focusedTab = await ctx.browserWorkspace.navigate({
      session: first,
      target: secondTab.target,
      expectedRevision: 0,
      url: 'https://beta.test/',
    })
    const focused = await ctx.browserWorkspace.focus({ session: first, target: secondTab.target, expectedRevision: focusedTab.revision })
    await ctx.browserWorkspace.focus({ session: first, target: secondTab.target, expectedRevision: focused.revision })
    await expect(ctx.browserWorkspace.screenshot({ session: first, target: secondTab.target }))
      .resolves.toMatchObject({ target: secondTab.target, mediaType: 'image/png' })

    const other = await ctx.browserWorkspace.create({ session: second, profile: 'temporary' })
    await ctx.browserWorkspace.navigate({
      session: second,
      target: other.target,
      expectedRevision: 0,
      url: 'https://beta.test/',
    })

    const firstSnapshot = ctx.browserWorkspace.snapshot(first)
    expect(firstSnapshot.workspaces).toHaveLength(2)
    expect(firstSnapshot.activeWorkspaceId).toBe(work.target.workspaceId)
    const workSpace = firstSnapshot.workspaces.find(item => item.workspaceId === work.target.workspaceId)
    expect(workSpace?.profileId).toBe(work.target.profileId)
    expect(workSpace?.browsers).toHaveLength(2)
    expect(workSpace?.activeBrowserId).toBe(work.target.browserId)
    expect(workSpace?.browsers[0]?.tabs.map(tab => tab.tabId)).toEqual([work.target.tabId, secondTab.target.tabId])
    expect(workSpace?.browsers[0]?.activeTabId).toBe(secondTab.target.tabId)
    expect(firstSnapshot.workspaces.some(item => item.workspaceId === personal.target.workspaceId)).toBe(true)
    expect(JSON.stringify(firstSnapshot)).not.toContain(other.target.tabId)

    const secondSnapshot = ctx.browserWorkspace.snapshot(second)
    expect(secondSnapshot.workspaces).toHaveLength(1)
    expect(secondSnapshot.workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: other.target.tabId, controlOwner: 'agent', revision: 1 },
    ])
    expect(JSON.stringify(secondSnapshot)).not.toContain(work.target.tabId)

    await expect(ctx.browserWorkspace.observe({ session: second, target: work.target }))
      .rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.create({
      session: second,
      profile: 'persistent',
      name: BrowserProfileName('work'),
      attach: { kind: 'browser', workspaceId: work.target.workspaceId, browserId: work.target.browserId },
    })).rejects.toMatchObject({ code: 'BROWSER_TRANSFER_UNSUPPORTED' })
    await expect(ctx.browserWorkspace.create({
      session: first,
      profile: 'temporary',
      attach: { kind: 'workspace', workspaceId: work.target.workspaceId.replace('workspace', 'missing') as typeof work.target.workspaceId },
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })
    await expect(ctx.browserWorkspace.focus({
      session: first,
      target: {
        profileId: work.target.profileId,
        workspaceId: work.target.workspaceId,
        browserId: work.target.browserId,
        tabId: BrowserTabId('missing-tab'),
      },
      expectedRevision: 0,
    })).rejects.toMatchObject({ code: 'BROWSER_SESSION_MISMATCH' })

    await ctx.browserWorkspace.close({ session: first, target: work.target, expectedRevision: 1 })
    const afterInactiveClose = ctx.browserWorkspace.snapshot(first)
    const remainingWork = afterInactiveClose.workspaces.find(item => item.workspaceId === work.target.workspaceId)
    expect(remainingWork?.browsers[0]?.tabs).toEqual([
      { tabId: secondTab.target.tabId, controlOwner: 'agent', revision: 3 },
    ])
    expect(remainingWork?.browsers[0]?.activeTabId).toBe(secondTab.target.tabId)
    await ctx.browserWorkspace.close({ session: first, target: secondTab.target, expectedRevision: focused.revision + 1 })
    const afterBrowserClose = ctx.browserWorkspace.snapshot(first)
    const remainingAfterBrowser = afterBrowserClose.workspaces.find(item => item.workspaceId === work.target.workspaceId)
    expect(remainingAfterBrowser?.browsers).toHaveLength(1)
    expect(remainingAfterBrowser?.activeBrowserId).toBe(secondBrowser.target.browserId)
  })

  it('restores one Session Workspace after reload and closes leftover tabs on Session disposal', async () => {
    const ctx = await harness()
    const first = ctx.sessions.create(SessionId('session-a'))
    ctx.browserWorkspace.setDock({ session: first, open: true, width: 800 })
    const created = await ctx.browserWorkspace.create({ session: first, profile: 'temporary' })
    const extra = await ctx.browserWorkspace.create({
      session: first,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: created.target.workspaceId, browserId: created.target.browserId },
    })
    await ctx.browserWorkspace.navigate({
      session: first,
      target: extra.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    const logged = first.events.filter(event => event.type === 'browser/workspace')
    expect(logged.length).toBeGreaterThan(0)

    const replayed = foldBrowserWorkspace(first.events)
    expect(replayed).toEqual(ctx.browserWorkspace.snapshot(first))
    expect(ctx.sessionProjections.snapshot(first).values.browserWorkspace).toEqual(replayed)

    const restoredCtx = new Context()
    await restoredCtx.plugin(SessionStore)
    await restoredCtx.plugin(SessionProjectionRegistry)
    await restoredCtx.plugin(BrowserRuntimeDeterministic, { idPrefix: 'space', pages: PAGES })
    await restoredCtx.plugin(BrowserWorkspaceBinder)
    const restored = restoredCtx.sessions.create(SessionId('session-a-restored'), { seed: first.events })
    expect(restoredCtx.browserWorkspace.snapshot(restored)).toEqual(replayed)
    expect(restoredCtx.sessionProjections.snapshot(restored).values.browserWorkspace).toEqual(replayed)

    const sibling = await ctx.browserWorkspace.create({
      session: first,
      profile: 'temporary',
      attach: { kind: 'workspace', workspaceId: created.target.workspaceId },
    })
    await ctx.browserWorkspace.focus({ session: first, target: extra.target, expectedRevision: 1 })
    await ctx.browserWorkspace.close({ session: first, target: extra.target, expectedRevision: 2 })
    const afterClose = ctx.browserWorkspace.snapshot(first)
    expect(afterClose.workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, controlOwner: 'agent', revision: 0 },
    ])
    expect(afterClose.workspaces[0]?.browsers[0]?.activeTabId).toBe(created.target.tabId)
    await ctx.browserWorkspace.close({ session: first, target: sibling.target, expectedRevision: 0 })
    await ctx.browserWorkspace.close({ session: first, target: created.target, expectedRevision: 0 })
    expect(ctx.browserWorkspace.snapshot(first).workspaces).toEqual([])
    expect(ctx.browserWorkspace.snapshot(first).activeWorkspaceId).toBeNull()

  })

  it('closes leftover live tabs when the owning Session leaves the store', async () => {
    const ctx = await harness()
    const leftover = ctx.sessions.prepare(SessionId('session-cleanup'))
    const detach = ctx.sessions.enter(leftover)
    ctx.sessions.announce(leftover)
    const live = await ctx.browserWorkspace.create({ session: leftover, profile: 'temporary' })
    detach()
    await expect.poll(() => ctx.browserRuntime.observe({ target: live.target })).toMatchObject({ status: 'closed' })
    expect(ctx.browserWorkspace.snapshot(leftover).workspaces).toEqual([])
    const sameDock = ctx.browserWorkspace.setDock({ session: leftover, open: false, width: 640 })
    expect(sameDock).toEqual(ctx.browserWorkspace.snapshot(leftover))

    const observer = ctx.browserRuntime.observe.bind(ctx.browserRuntime)
    ctx.browserRuntime.observe = async (request) => {
      if (request.target.tabId === live.target.tabId) throw new Error('cleanup observe failed')
      return observer(request)
    }
    const failing = ctx.sessions.create(SessionId('session-failing-cleanup'))
    failing.append('browser/workspace', {
      dockOpen: false,
      dockWidth: 640,
      userCollapsed: false,
      activeWorkspaceId: live.target.workspaceId,
      workspaces: [{
        workspaceId: live.target.workspaceId,
        profileId: live.target.profileId,
        activeBrowserId: live.target.browserId,
        browsers: [{
          browserId: live.target.browserId,
          activeTabId: live.target.tabId,
          tabs: [{ tabId: live.target.tabId, controlOwner: 'agent', revision: 0 }],
        }],
      }],
    })
    await ctx.browserWorkspace.cleanup(failing)
    ctx.browserRuntime.observe = observer

    const alreadyClosed = ctx.sessions.create(SessionId('session-already-closed'))
    alreadyClosed.append('browser/workspace', {
      dockOpen: false,
      dockWidth: 640,
      userCollapsed: false,
      activeWorkspaceId: live.target.workspaceId,
      workspaces: [{
        workspaceId: live.target.workspaceId,
        profileId: live.target.profileId,
        activeBrowserId: live.target.browserId,
        browsers: [{
          browserId: live.target.browserId,
          activeTabId: live.target.tabId,
          tabs: [{ tabId: live.target.tabId, controlOwner: 'agent', revision: 0 }],
        }],
      }],
    })
    await ctx.browserWorkspace.cleanup(alreadyClosed)
    expect(ctx.browserWorkspace.snapshot(alreadyClosed).workspaces).toEqual([])
  })

  it('focuses and closes a background tab with that tab\'s listed revision', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-tab-revision'))
    const first = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const second = await ctx.browserWorkspace.create({
      session,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: first.target.workspaceId, browserId: first.target.browserId },
    })
    await ctx.browserWorkspace.navigate({
      session, target: first.target, expectedRevision: 0, url: 'https://alpha.test/',
    })
    await ctx.browserWorkspace.navigate({
      session, target: second.target, expectedRevision: 0, url: 'https://beta.test/',
    })
    const listed = ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs
    expect(listed).toEqual([
      { tabId: first.target.tabId, controlOwner: 'agent', revision: 1 },
      { tabId: second.target.tabId, controlOwner: 'agent', revision: 1 },
    ])
    const firstRevision = listed?.[0]?.revision
    const secondRevision = listed?.[1]?.revision
    if (firstRevision === undefined || secondRevision === undefined) {
      throw new Error('expected listed per-tab revisions')
    }
    const focused = await ctx.browserWorkspace.focus({
      session, target: first.target, expectedRevision: firstRevision,
    })
    expect(focused.revision).toBe(2)
    await expect(ctx.browserWorkspace.close({
      session, target: second.target, expectedRevision: secondRevision,
    })).resolves.toMatchObject({ status: 'closed', revision: 2 })

    const leftover = await ctx.browserWorkspace.create({
      session,
      profile: 'temporary',
      attach: { kind: 'browser', workspaceId: first.target.workspaceId, browserId: first.target.browserId },
    })
    await ctx.browserRuntime.close({ target: leftover.target, expectedRevision: leftover.revision })
    await expect(ctx.browserWorkspace.observe({ session, target: leftover.target }))
      .resolves.toMatchObject({ status: 'closed', revision: leftover.revision + 1 })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs.some(
      tab => tab.tabId === leftover.target.tabId,
    )).toBe(true)
  })

  it('rejects an invalid Dock width and disposes its invariant companion', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create()
    expect(() => ctx.browserWorkspace.setDock({ session, open: true, width: 0 }))
      .toThrow(/positive safe integer/)
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(BrowserWorkspaceInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })

  it('persists human takeover and return on the same Session identities', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-control'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const navigated = await ctx.browserWorkspace.navigate({
      session,
      target: created.target,
      expectedRevision: 0,
      url: 'https://alpha.test/',
    })
    expect(navigated.controlOwner).toBe('agent')
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, controlOwner: 'agent', revision: 1 },
    ])

    const inputted = await ctx.browserWorkspace.input({
      session,
      target: created.target,
      expectedRevision: navigated.revision,
      text: 'human typed',
    })
    expect(inputted).toMatchObject({
      controlOwner: 'human',
      text: 'human typed',
      target: created.target,
    })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, controlOwner: 'human', revision: 2 },
    ])
    await expect(ctx.browserWorkspace.navigate({
      session,
      target: created.target,
      expectedRevision: navigated.revision,
      url: 'https://beta.test/',
    })).rejects.toMatchObject({ code: 'BROWSER_REVISION_CONFLICT' })

    const taken = await ctx.browserWorkspace.takeover({
      session,
      target: created.target,
      expectedRevision: inputted.revision,
    })
    expect(taken.controlOwner).toBe('human')
    const returned = await ctx.browserWorkspace.returnControl({
      session,
      target: created.target,
      expectedRevision: taken.revision,
    })
    expect(returned).toMatchObject({
      controlOwner: 'agent',
      target: created.target,
    })
    expect(ctx.browserWorkspace.snapshot(session).workspaces[0]?.browsers[0]?.tabs).toEqual([
      { tabId: created.target.tabId, controlOwner: 'agent', revision: 4 },
    ])
    const replayed = foldBrowserWorkspace(session.events)
    expect(replayed.workspaces[0]?.browsers[0]?.tabs[0]?.controlOwner).toBe('agent')
  })

  it('adapts Remote methods onto the Session-bound verbs', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('session-remote'))
    const created = await ctx.browserWorkspace.create({ session, profile: 'temporary' })
    const binder = ctx.browserWorkspace
    expect(binder.remoteSetDock(session.id, { open: true, width: 720 })).toMatchObject({
      dockOpen: true, dockWidth: 720,
    })
    expect(binder.remoteSetDock(session.id, { open: false })).toMatchObject({ dockOpen: false })
    const opened = await binder.remoteNavigate(
      session.id, created.target, created.revision, 'https://alpha.test/',
    )
    await expect(binder.remoteObserve(session.id, created.target)).resolves.toMatchObject({ status: 'open' })
    await expect(binder.remoteScreenshot(session.id, created.target)).resolves.toMatchObject({
      target: created.target,
    })
    const focused = await binder.remoteFocus(session.id, created.target, opened.revision)
    const navigated = await binder.remoteNavigate(
      session.id, created.target, focused.revision, 'https://beta.test/',
    )
    expect(navigated.url).toBe('https://beta.test/')
    const blank = await binder.remoteInput(session.id, created.target, navigated.revision, {})
    const inputted = await binder.remoteInput(session.id, created.target, blank.revision, {
      url: 'https://beta.test/',
      text: 'typed',
    })
    expect(inputted.controlOwner).toBe('human')
    const taken = await binder.remoteTakeover(session.id, created.target, inputted.revision)
    const returned = await binder.remoteReturnControl(session.id, created.target, taken.revision)
    expect(returned.controlOwner).toBe('agent')
    await expect(binder.remoteClose(session.id, created.target, returned.revision))
      .resolves.toMatchObject({ status: 'closed' })
    expect(() => binder.remoteSetDock(SessionId('missing'), { open: true }))
      .toThrow(/not owned by this Session/)
  })
})

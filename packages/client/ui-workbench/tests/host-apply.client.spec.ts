/** Host apply writes the snapshot prefs patch onto the registered namespace. */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.ts'
import { SNAPSHOT_PREFS_NS } from '../src/snapshot-browser.ts'

const NS = SNAPSHOT_PREFS_NS

class SettingsService extends Service {
  readonly values = new Map<string, Record<string, unknown>>()
  readonly updates: object[] = []

  constructor(ctx: Context) {
    super(ctx, 'settings')
  }

  get(ns: string): unknown {
    return this.values.get(ns)
  }

  async update(ns: string, patch: object): Promise<void> {
    this.updates.push(patch)
    const current = this.values.get(ns) ?? {}
    this.values.set(ns, { ...current, ...patch })
  }
}

describe('ui-workbench host apply', () => {
  it('declares settings and the workbench plugin name', () => {
    expect(name).toBe('ui-workbench')
    expect(inject).toEqual(['settings'])
  })

  it('writes the official-browser enable patch onto the snapshot namespace', async () => {
    const ctx = new Context()
    const settings = new SettingsService(ctx)
    settings.values.set(NS, { tabsEnabled: { editor: true, browser: false }, browserInterceptLinks: false })
    await apply(ctx)
    expect(settings.updates).toEqual([{
      tabsEnabled: { editor: true, browser: true },
      browserInterceptLinks: true,
      browserInterceptHttps: true,
    }])
  })

  it('does not write when the snapshot already has the product state', async () => {
    const ctx = new Context()
    const settings = new SettingsService(ctx)
    settings.values.set(NS, { tabsEnabled: { git: true }, browserInterceptLinks: true, browserInterceptHttps: true })
    await apply(ctx)
    expect(settings.updates).toEqual([])
  })

  it('fails loud when the snapshot namespace is missing', async () => {
    const ctx = new Context()
    new SettingsService(ctx)
    await expect(apply(ctx)).rejects.toThrow(/dsh-better-sidebar settings namespace is not registered/)
  })

  it('fails loud when the loader has no snapshot row', async () => {
    const ctx = new Context()
    new SettingsService(ctx)
    ctx.provide('loader', { entries: () => [{ options: { id: 'ui-browser' } }] })
    await expect(apply(ctx)).rejects.toThrow(/dsh-better-sidebar settings namespace is not registered/)
  })

  it('fails loud when the snapshot row disappears before it registers', async () => {
    const ctx = new Context()
    new SettingsService(ctx)
    const entries: { options: { id: string } }[] = [{ options: { id: 'ui-better-sidebar' } }]
    ctx.provide('loader', { entries: () => entries })
    setImmediate(() => {
      entries.splice(0, entries.length)
    })
    await expect(apply(ctx)).rejects.toThrow(/dsh-better-sidebar settings namespace is not registered/)
  })

  it('joins the snapshot fiber before writing the product patch', async () => {
    const ctx = new Context()
    const settings = new SettingsService(ctx)
    ctx.provide('loader', {
      entries: () => [{
        options: { id: 'ui-better-sidebar', name: '@deepseek-ai/dsh-client-ui-better-sidebar' },
        fiber: {
          async await() {
            settings.values.set(NS, { tabsEnabled: { editor: true } })
          },
        },
      }],
    })
    await apply(ctx)
    expect(settings.updates).toEqual([{
      tabsEnabled: { editor: true, browser: true },
      browserInterceptLinks: true,
      browserInterceptHttps: true,
    }])
  })

  it('recognizes the snapshot by package name when the entry id differs', async () => {
    const ctx = new Context()
    const settings = new SettingsService(ctx)
    ctx.provide('loader', {
      entries: () => [{
        options: { id: 'web-ui-better-sidebar', name: '@deepseek-ai/dsh-client-ui-better-sidebar' },
        fiber: {
          async await() {
            settings.values.set(NS, {})
          },
        },
      }],
    })
    await apply(ctx)
    expect(settings.updates).toEqual([{
      tabsEnabled: { browser: true },
      browserInterceptLinks: true,
      browserInterceptHttps: true,
    }])
  })

  it('waits one turn when the snapshot fiber has not been created yet', async () => {
    const ctx = new Context()
    const settings = new SettingsService(ctx)
    const entry: { options: { id: string }; fiber?: { await(): Promise<void> } } = {
      options: { id: 'ui-better-sidebar' },
    }
    ctx.provide('loader', { entries: () => [entry] })
    setImmediate(() => {
      settings.values.set(NS, { tabsEnabled: { git: true } })
    })
    await apply(ctx)
    expect(settings.updates).toEqual([{
      tabsEnabled: { git: true, browser: true },
      browserInterceptLinks: true,
      browserInterceptHttps: true,
    }])
  })
})

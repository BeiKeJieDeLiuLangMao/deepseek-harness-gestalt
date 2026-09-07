import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SERVICE_API, TYPE_API } from '../src/api-catalog.ts'
import { hostInspectProviders } from '../src/providers.ts'

describe('Host Service inspect catalog', () => {
  it('omits Client-only Better Sidebar declarations while preserving Host services', async () => {
    const provider = hostInspectProviders({} as Context)
      .find(candidate => candidate.manifest.id === 'Service')
    if (provider === undefined) throw new Error('Service inspect provider is missing')

    const compact = await provider.query('listService', undefined, {} as never) as {
      services: Array<{ key: string }>
    }
    expect(compact.services.some(service => service.key === 'betterSidebar')).toBe(false)
    expect(compact.services.some(service => service.key === 'agents')).toBe(true)
    await expect(provider.query(
      'listService',
      { service: 'betterSidebar' },
      {} as never,
    )).rejects.toThrow('no catalogued Service named "betterSidebar"')

    const agents = await provider.query(
      'listService',
      { service: 'agents' },
      {} as never,
    ) as { service: { key: string }; referencedTypes: Array<{ name: string; declaration: string }> }
    expect(agents.service.key).toBe('agents')
    expect(agents.referencedTypes.map(type => type.declaration).join('\n')).not.toContain('SidebarContextShape')
    expect(SERVICE_API.some(service => service.key === 'betterSidebar')).toBe(false)
  })

  it.each([
    'BetterSidebarService',
    'SidebarContextShape',
    'TabDescriptor',
  ])('omits Client-only type %s independently', (forbiddenName) => {
    expect(TYPE_API.map(type => type.name)).not.toContain(forbiddenName)
  })
})

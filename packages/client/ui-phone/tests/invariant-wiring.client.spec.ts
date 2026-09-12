import { describe, expect, it } from 'vitest'
import { buildOfficialPhoneDefinition } from '../src/client/registry.ts'

describe('ui-phone invariant wiring', () => {
  it('constructs the official descriptor without creating a device controller', () => {
    const definition = buildOfficialPhoneDefinition({
      source: {
        getBadge: () => ({ onlineCount: 0 }), snapshot: () => ({ android: [], ios: [] }),
        refresh: async () => {}, subscribe: () => () => {},
      },
      title: () => '手机',
      occupiedTitle: name => `手机·${name}`,
    })
    expect(definition).toMatchObject({ kind: 'phone', single: true })
  })
})

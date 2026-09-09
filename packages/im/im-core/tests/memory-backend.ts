/**
 * Self-contained in-memory StorageBackend implementation for im-core tests.
 * Satisfies the KvFacet and KvUnit boundaries without cross-package relative imports to private test helpers.
 */

import type { KvFacet, KvUnit, KvUnitDescriptor, StorageBackend } from '@deepseek-ai/dsh-storage'

export class TestMemoryStorageBackend implements StorageBackend {
  private readonly units = new Map<string, Map<string, Map<string, unknown>>>()
  private readonly globals = new Map<string, unknown>()
  putDelayMs = 0

  readonly kv: KvFacet = {
    open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
      if (!this.units.has(descriptor.name)) {
        this.units.set(descriptor.name, new Map())
        for (const t of descriptor.tables) {
          this.units.get(descriptor.name)!.set(t, new Map())
        }
      }
      const unitMap = this.units.get(descriptor.name)!

      return {
        loadAll: async () => {
          const tables: Record<string, Record<string, unknown>> = {}
          for (const [table, rows] of unitMap.entries()) {
            tables[table] = Object.fromEntries(rows.entries())
          }
          return {
            global: this.globals.get(descriptor.name) ?? null,
            tables,
          }
        },
        putRecord: async (table: string, key: string, value: unknown) => {
          if (this.putDelayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.putDelayMs))
          }
          if (!unitMap.has(table)) {
            unitMap.set(table, new Map())
          }
          unitMap.get(table)!.set(key, value)
        },
        deleteRecord: async (table: string, key: string) => {
          const t = unitMap.get(table)
          if (t) {
            t.delete(key)
          }
        },
        setGlobal: async (value: unknown) => {
          if (this.putDelayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.putDelayMs))
          }
          this.globals.set(descriptor.name, value)
        },
        close: async () => {},
      }
    },
  }

  async close() {}
}

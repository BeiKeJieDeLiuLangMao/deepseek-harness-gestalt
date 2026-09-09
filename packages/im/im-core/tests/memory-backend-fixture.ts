/**
 * File-backed or shared in-memory storage backend fixture for real Loader composition tests.
 * Enables two-process or two-generation reload testing without external package dependencies.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { KvFacet, KvUnit, KvUnitDescriptor, StorageBackend } from '@deepseek-ai/dsh-storage'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'

export const name = 'test-storage-memory-backend'
export const inject = ['storage']

export class FileKvStorageBackend implements StorageBackend {
  private readonly storageFilePath: string | undefined

  constructor(storageFilePath?: string) {
    this.storageFilePath = storageFilePath
  }

  private readRaw(): { globals: Record<string, unknown>; units: Record<string, Record<string, Record<string, unknown>>> } {
    const file = this.storageFilePath ?? process.env.DSH_IM_TEST_STORAGE_FILE
    if (!file || !existsSync(file)) {
      return { globals: {}, units: {} }
    }
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return { globals: {}, units: {} }
    }
  }

  private writeRaw(data: { globals: Record<string, unknown>; units: Record<string, Record<string, Record<string, unknown>>> }): void {
    const file = this.storageFilePath ?? process.env.DSH_IM_TEST_STORAGE_FILE
    if (!file) return
    writeFileSync(file, JSON.stringify(data, null, 2))
  }

  readonly kv: KvFacet = {
    open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
      return {
        loadAll: async () => {
          const raw = this.readRaw()
          const tables: Record<string, Record<string, unknown>> = {}
          for (const t of descriptor.tables) {
            tables[t] = raw.units[descriptor.name]?.[t] ?? {}
          }
          return {
            global: raw.globals[descriptor.name] ?? null,
            tables,
          }
        },
        putRecord: async (table: string, key: string, value: unknown) => {
          const raw = this.readRaw()
          const domainUnits = raw.units[descriptor.name] ?? (raw.units[descriptor.name] = {})
          const tableMap = domainUnits[table] ?? (domainUnits[table] = {})
          tableMap[key] = value
          this.writeRaw(raw)
        },
        deleteRecord: async (table: string, key: string) => {
          const raw = this.readRaw()
          const tableMap = raw.units[descriptor.name]?.[table]
          if (tableMap) {
            Reflect.deleteProperty(tableMap, key)
            this.writeRaw(raw)
          }
        },
        setGlobal: async (value: unknown) => {
          const raw = this.readRaw()
          raw.globals[descriptor.name] = value
          this.writeRaw(raw)
        },
        close: async () => {},
      }
    },
  }

  async close() {}
}

export function apply(ctx: Context): void {
  const filePath = process.env.DSH_IM_TEST_STORAGE_FILE
  const backend = new FileKvStorageBackend(filePath)
  ctx.storage.backend.register('memory', backend)
  ctx.provide(storageBackendServiceKey('memory'), backend)
}

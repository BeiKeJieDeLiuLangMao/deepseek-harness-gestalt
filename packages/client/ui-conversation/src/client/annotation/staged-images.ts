/** IndexedDB persistence for Composer-staged image bytes required by an unsent draft. */

const DB_NAME = 'dsh.annotation.staged-images'
const STORE = 'files'
const DB_VERSION = 1

/** One IndexedDB row of Composer-staged image bytes for an unsent pin. */
export interface StagedImageRecord {
  readonly key: string
  readonly name: string
  readonly type: string
  readonly bytes: ArrayBuffer
}

/**
 * Session-scoped staged-image key.
 * @param sessionId - Session owner.
 * @param imageId - Draft attachment id.
 * @returns Durable IndexedDB key.
 */
export function stagedImageKey(sessionId: string, imageId: string): string {
  return `${sessionId}:${imageId}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('indexedDB open failed')) }
  })
}

/**
 * Persist one staged image's bytes.
 * @param record - File identity and bytes.
 */
export async function putStagedImage(record: StagedImageRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => { resolve() }
    tx.onerror = () => { reject(tx.error ?? new Error('indexedDB put failed')) }
  })
  db.close()
}

/**
 * Load one staged image.
 * @param key - Session-scoped staged-image key.
 * @returns The record, or undefined when absent.
 */
export async function getStagedImage(key: string): Promise<StagedImageRecord | undefined> {
  const db = await openDb()
  const record = await new Promise<StagedImageRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(key)
    request.onsuccess = () => { resolve(request.result as StagedImageRecord | undefined) }
    request.onerror = () => { reject(request.error ?? new Error('indexedDB get failed')) }
  })
  db.close()
  return record
}

/**
 * Drop one staged image after send or discard.
 * @param key - Session-scoped staged-image key.
 */
export async function deleteStagedImage(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => { resolve() }
    tx.onerror = () => { reject(tx.error ?? new Error('indexedDB delete failed')) }
  })
  db.close()
}

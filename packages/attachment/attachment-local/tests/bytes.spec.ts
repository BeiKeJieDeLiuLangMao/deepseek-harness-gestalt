import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { readByteFile, saveByteFile } from '../src/bytes.ts'

const roots: string[] = []

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'dsh-attachment-bytes-'))
  roots.push(value)
  return join(value, 'attachments', 'v1')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function readdirSafe(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

const PDF = Uint8Array.from(Buffer.from('%PDF-1.4 opaque companion bytes', 'utf8'))

describe('local opaque byte attachments', () => {
  it('publishes non-image bytes, strips path names, and deduplicates equal content', async () => {
    const storageRoot = await root()
    const first = await saveByteFile(storageRoot, {
      data: PDF, mediaType: 'application/pdf', name: 'C:\\Users\\a\\notes.pdf',
    }, 1024)
    const second = await saveByteFile(storageRoot, {
      data: PDF, mediaType: 'application/pdf', name: 'notes.pdf',
    }, 1024)
    const sha256 = createHash('sha256').update(PDF).digest('hex')
    expect(first).toMatchObject({
      attachmentId: `sha256:${sha256}`,
      mediaType: 'application/pdf',
      bytes: PDF.byteLength,
      sha256,
      name: 'notes.pdf',
    })
    expect(second.attachmentId).toBe(first.attachmentId)
    await expect(readByteFile(storageRoot, first)).resolves.toEqual({ ref: first, data: PDF })
    const object = join(storageRoot, 'objects', sha256.slice(0, 2), sha256)
    await expect(readFile(object)).resolves.toEqual(Buffer.from(PDF))
  })

  it('refuses empty, oversized, unnamed, and invalid media-type byte attachments', async () => {
    const storageRoot = await root()
    await expect(saveByteFile(storageRoot, {
      data: new Uint8Array(0), mediaType: 'application/pdf', name: 'empty.pdf',
    }, 1024)).rejects.toMatchObject({ code: 'BYTES_EMPTY' })
    await expect(saveByteFile(storageRoot, {
      data: PDF, mediaType: 'application/pdf', name: 'notes.pdf',
    }, 4)).rejects.toMatchObject({ code: 'BYTES_TOO_LARGE' })
    await expect(saveByteFile(storageRoot, {
      data: PDF, mediaType: 'not a type', name: 'notes.pdf',
    }, 1024)).rejects.toMatchObject({ code: 'INVALID_BYTE_MEDIA_TYPE' })
    await expect(saveByteFile(storageRoot, {
      data: PDF, mediaType: 'application/pdf', name: '\u0000',
    }, 1024)).rejects.toMatchObject({ code: 'INVALID_BYTE_NAME' })
    expect(await readdirSafe(join(storageRoot, 'tmp'))).toEqual([])
  })

  it('cleans a staging file when publication cannot replace a conflicting directory', async () => {
    const storageRoot = await root()
    const sha256 = createHash('sha256').update(PDF).digest('hex')
    const target = join(storageRoot, 'objects', sha256.slice(0, 2), sha256)
    await mkdir(target, { recursive: true })

    await expect(saveByteFile(storageRoot, {
      data: PDF, mediaType: 'application/pdf', name: 'notes.pdf',
    }, 1024)).rejects.toMatchObject({ code: 'ATTACHMENT_WRITE_FAILED' })
    expect(await readdirSafe(join(storageRoot, 'tmp'))).toEqual([])
  })

  it('rereads published bytes after a later write-time cap would refuse them', async () => {
    const storageRoot = await root()
    const data = Uint8Array.from(Buffer.from('not an image', 'utf8'))
    const ref = await saveByteFile(storageRoot, { data, mediaType: 'text/plain', name: 'notes.txt' }, 64)
    await expect(readByteFile(storageRoot, ref)).resolves.toEqual({ ref, data })
    await expect(saveByteFile(storageRoot, { data, mediaType: 'text/plain', name: 'notes.txt' }, 4))
      .rejects.toMatchObject({ code: 'BYTES_TOO_LARGE' })
    await expect(readByteFile(storageRoot, ref)).resolves.toEqual({ ref, data })
  })

  it('fails closed when a byte object is missing, corrupted, or addressed by an invalid reference', async () => {
    const storageRoot = await root()
    const ref = await saveByteFile(storageRoot, {
      data: PDF, mediaType: 'application/pdf', name: 'notes.pdf',
    }, 1024)
    const sha256 = createHash('sha256').update(PDF).digest('hex')
    const object = join(storageRoot, 'objects', sha256.slice(0, 2), sha256)
    await chmod(object, 0o600)
    await writeFile(object, Uint8Array.of(1, 2, 3))
    await expect(readByteFile(storageRoot, ref)).rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
    await expect(readByteFile(storageRoot, { ...ref, attachmentId: 'bad' as never }))
      .rejects.toMatchObject({ code: 'INVALID_ATTACHMENT_REF' })
    await expect(readByteFile(storageRoot, { ...ref, sha256: 'b'.repeat(64) }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
    const missingRoot = await root()
    await mkdir(missingRoot, { recursive: true })
    await expect(readByteFile(missingRoot, ref)).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' })
    const unreadableRoot = await root()
    const unreadable = join(unreadableRoot, 'objects', sha256.slice(0, 2), sha256)
    await mkdir(unreadable, { recursive: true })
    await expect(readByteFile(unreadableRoot, ref)).rejects.toMatchObject({ code: 'ATTACHMENT_READ_FAILED' })
    const saved = await saveByteFile(storageRoot, {
      data: Uint8Array.from(Buffer.from('second object', 'utf8')),
      mediaType: 'text/plain',
      name: 'second.txt',
    }, 1024)
    await expect(readByteFile(storageRoot, { ...saved, mediaType: 'not a type' }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
    const controller = new AbortController()
    const reason = new Error('byte read cancelled')
    controller.abort(reason)
    await expect(readByteFile(storageRoot, saved, controller.signal)).rejects.toBe(reason)
  })
})

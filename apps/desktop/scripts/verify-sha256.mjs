import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Verify a file against a trusted SHA-256 digest.
 * @param {string} path
 * @param {string} expected
 * @returns {Promise<void>}
 */
export async function verifySha256(path, expected) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  const actual = digest.digest('hex')
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${path}: expected ${expected}, received ${actual}`)
  }
}

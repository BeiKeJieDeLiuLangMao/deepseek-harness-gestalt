/** Reviewed file snapshots for the deployment-wide Project Membership authority cutover. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { validateProjectMembershipDocument } from '@deepseek-ai/dsh-project-membership-core'

/** Exact source bytes and digest; the document contains private membership records. */
export interface MembershipCutoverSnapshot {
  document: string
  digest: string
}

/** Validated administrative operation; import and export require all writers to be fenced. */
export type MembershipCutoverCommand =
  | { kind: 'capture'; source: string | undefined; output: string }
  | { kind: 'import'; source: string; digest: string }
  | { kind: 'export'; output: string }

/**
 * Parse the cutover CLI without acquiring database or cloud resources.
 * @param args - Subcommand and explicit named arguments.
 * @returns A bounded operation with the required writer-fence acknowledgement.
 */
export function parseMembershipCutoverCommand(args: readonly string[]): MembershipCutoverCommand {
  const [kind, ...remaining] = args
  const fields = new Map<string, string>()
  const flags = new Set<string>()
  for (let index = 0; index < remaining.length; index += 1) {
    const name = remaining[index]
    if (name === '--empty' || name === '--writers-fenced') {
      if (flags.has(name)) throw new Error(`Duplicate cutover flag: ${name}`)
      flags.add(name)
    } else if (name === '--source' || name === '--output' || name === '--sha256') {
      const value = remaining[++index]
      if (value === undefined || value === '' || value.startsWith('--') || fields.has(name)) throw new Error(`Invalid cutover argument: ${name}`)
      fields.set(name, value)
    } else throw new Error('Unknown membership cutover argument')
  }
  const required = (name: string): string => {
    const value = fields.get(name)
    if (value === undefined) throw new Error(`Membership cutover requires ${name}`)
    return value
  }
  if (kind === 'capture') {
    if (flags.has('--writers-fenced') || fields.has('--sha256')) throw new Error('Capture accepts only a source or explicit empty state and an output')
    if (flags.has('--empty') === fields.has('--source')) throw new Error('Capture requires exactly one of --source or --empty')
    return { kind, source: fields.get('--source'), output: required('--output') }
  }
  if (!flags.has('--writers-fenced')) throw new Error('Import and export require --writers-fenced after stopping every membership writer')
  if (flags.has('--empty')) throw new Error('Only capture accepts --empty')
  if (kind === 'import') {
    if (fields.has('--output')) throw new Error('Import does not accept --output')
    const digest = required('--sha256')
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error('Membership import requires a full lowercase SHA-256 digest')
    return { kind, source: required('--source'), digest }
  }
  if (kind === 'export') {
    if (fields.has('--source') || fields.has('--sha256')) throw new Error('Export accepts only --output')
    return { kind, output: required('--output') }
  }
  throw new Error('Membership cutover command must be capture, import or export')
}

/**
 * Read and validate an immutable source without treating a missing file as an empty corpus.
 * @param source - Source filename, or undefined only for an explicitly requested empty snapshot.
 * @returns Exact source bytes and SHA-256, without exposing member identities in diagnostics.
 */
export async function readMembershipCutoverSnapshot(source: string | undefined): Promise<MembershipCutoverSnapshot> {
  const bytes = source === undefined
    ? Buffer.from(JSON.stringify({ formatVersion: 1, projects: [], memberships: [], invitations: [] }))
    : await readFile(source)
  const document = bytes.toString('utf8')
  if (!Buffer.from(document).equals(bytes)) throw new Error('Membership snapshot must contain valid UTF-8 bytes')
  validateProjectMembershipDocument(document)
  return { document, digest: createHash('sha256').update(document).digest('hex') }
}

/**
 * Retain a private, exclusive snapshot and verify the bytes after writing.
 * @param output - New backup filename; an existing file is never overwritten.
 * @param snapshot - Validated authority bytes and digest.
 * @returns Nothing; an invalid document, digest mismatch or existing backup rejects.
 */
export async function writeMembershipCutoverSnapshot(output: string, snapshot: MembershipCutoverSnapshot): Promise<void> {
  validateProjectMembershipDocument(snapshot.document)
  if (createHash('sha256').update(snapshot.document).digest('hex') !== snapshot.digest) throw new Error('Membership export digest mismatch')
  await mkdir(dirname(output), { recursive: true, mode: 0o700 })
  await writeFile(output, snapshot.document, { flag: 'wx', mode: 0o600 })
  const persisted = await readMembershipCutoverSnapshot(output)
  if (persisted.digest !== snapshot.digest) throw new Error('Membership backup readback digest mismatch')
}

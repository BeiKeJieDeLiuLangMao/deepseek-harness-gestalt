import { describe, expect, it } from 'vitest'
import { parseAccountDeletionRecord } from '../src/deletion.ts'
import { parseAccountDeletionProjects, parseAccountDeletionSuccessors, parseAccountDeletionView,
  parseAccountDeletionId, parseAccountDeletionRecoveryToken } from '@deepseek-ai/dsh-platform-account'

const candidate = { membershipId: 'member-1', accountId: 'account-2', label: 'Successor' }
const project = { projectId: 'project-1', name: 'Shared project', candidates: [candidate] }
const record = { operationId: 'operation-1', accountId: 'account-1', installationId: 'installation-1',
  identityNamespace: 'test', publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
  recoveryTokenHash: 'a'.repeat(43), successors: [], sessionIds: ['session-1'], status: 'deleting', projects: [] }

describe('durable deletion record admission', () => {
  it('restores pending, replacement-required and completed records', () => {
    expect(parseAccountDeletionRecord(record)).toEqual(record)
    expect(parseAccountDeletionRecord({ ...record, status: 'action-required', projects: [project] }).projects).toEqual([project])
    expect(parseAccountDeletionRecord({ ...record, status: 'complete', completedAt: 0 }).completedAt).toBe(0)
  })

  it.each([null, [], 1])('rejects a non-record %j', (value) => {
    expect(() => parseAccountDeletionRecord(value)).toThrow('must be an object')
  })

  it.each([
    ['identityNamespace', 1], ['identityNamespace', ' '],
    ['recoveryTokenHash', 1], ['recoveryTokenHash', 'invalid'],
    ['publicKey', null], ['publicKey', []], ['publicKey', 1],
    ['publicKey', { kty: 'RSA' }], ['publicKey', { kty: 'EC', crv: 'P-384' }],
    ['publicKey', { kty: 'EC', crv: 'P-256', x: 1 }],
    ['publicKey', { kty: 'EC', crv: 'P-256', x: 'x', y: 1 }],
    ['publicKey', { ...record.publicKey, d: 'private' }], ['sessionIds', null],
    ['completedAt', 0.5], ['completedAt', -1], ['completedAt', 0],
    ['status', 'complete'], ['accountId', ''], ['installationId', ''], ['sessionIds', ['']],
  ])('rejects corrupt persisted %s: %j', (field, value) => {
    expect(() => parseAccountDeletionRecord({ ...record, [field]: value })).toThrow()
  })
})

describe('deletion wire values', () => {
  it.each([null, [], 1])('rejects a non-object view %j', (value) => {
    expect(() => parseAccountDeletionView(value)).toThrow('must be an object')
  })
  it.each([1, '', 'a'.repeat(129), 'contains spaces'])('rejects an invalid operation id %j', (value) => {
    expect(() => parseAccountDeletionId(value)).toThrow('identifier characters')
  })
  it.each([1, '', 'a'.repeat(42)])('rejects an invalid recovery token %j', (value) => {
    expect(() => parseAccountDeletionRecoveryToken(value)).toThrow('32 random bytes')
  })
  it('rejects unknown status and projects attached to non-actionable progress', () => {
    expect(() => parseAccountDeletionView({ ...record, status: 'unknown' })).toThrow('status is invalid')
    expect(() => parseAccountDeletionView({ ...record, projects: [project] })).toThrow('Only action-required')
  })
  it('rejects ambiguous project or member selections', () => {
    const choice = { projectId: 'project-1', successorMembershipId: 'member-1' }
    expect(parseAccountDeletionSuccessors([choice])).toEqual([choice])
    expect(() => parseAccountDeletionSuccessors({})).toThrow('must be an array')
    expect(() => parseAccountDeletionSuccessors([choice, choice])).toThrow('must be unique')
    expect(() => parseAccountDeletionProjects({})).toThrow('must be an array')
    expect(() => parseAccountDeletionProjects([project, project])).toThrow('must be unique')
    expect(() => parseAccountDeletionProjects([{ ...project, candidates: {} }])).toThrow('must be an array')
    expect(() => parseAccountDeletionProjects([{ ...project, candidates: [candidate, candidate] }])).toThrow('must be unique')
  })
  it.each([1, ' ', 'a'.repeat(1025)])('rejects invalid presentation values', (value) => {
    expect(() => parseAccountDeletionProjects([{ ...project, name: value }])).toThrow('non-empty and bounded')
  })
})

import { describe, expect, it } from 'vitest'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'

const header = { type: 'session', version: 0, id: 'gestalt-history', createdAt: 1, delegationDepth: 0 }

describe('Gestalt historical session migration', () => {
  it('retains the empty model policy recorded by a default session through v0 to v3', () => {
    const row = { type: 'subagent/model-selection-policy', seq: 0, time: 2, data: { allowedModels: [] } }
    const source = JSON.stringify({ header, row })
    const reader = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
    reader.decodeRow(row)
    const target = reader.finish()
    expect(target.header.version).toBe(3)
    expect(target.events).toEqual([row])
    expect(JSON.stringify({ header, row })).toBe(source)
  })
})

const payloads = [
  ['browser/workspace', { workspaces: [{ workspaceId: 'w', profileId: 'p', browsers: [{ browserId: 'b', tabs: [{ tabId: 't', revision: 17, url: 'https://example.com' }], activeTabId: 't' }], activeBrowserId: 'b' }], activeWorkspaceId: 'w' }],
  ['member-question/asked', { questionId: 'q', toProjectMember: 'member', projectId: 'p', background: '', questions: [{ id: 'i', question: 'Which?' }], originSessionId: 'origin' }],
  ['member-question/outcome', { questionId: 'q', outcome: 'answered', answers: [{ id: 'i', selected: ['A'], custom: '' }] }],
  ['member-question/received', { questionId: 'q', projectId: 'p', originSessionId: 'origin', arrivedAt: 10, expiresAt: 20, origin: { projectName: 'project', originSessionTitle: 'session', askerAccountId: 'account', askerRole: 'member', askerDisplayName: 'Member', askerAvatarUrl: '' }, background: '', questions: [{ id: 'i', question: 'Which?', header: 'Pick', options: [{ label: 'A', description: '' }], multiSelect: false }], references: [{ path: 'doc.md', reason: 'context' }], cachedReferences: [{ path: 'doc.md', reason: 'context', cachedPath: '.dsh/member-questions/q/doc.md' }] }],
  ['member-question/settled', { type: 'member-question-settled', operationId: 'op', questionId: 'q', settledAt: 21, outcome: 'answered', settledByInstallationId: 'installation', settledByDeviceName: 'Desktop', answers: [{ id: 'i', selected: ['A'] }] }],
  ['session/attachment-admitted', { attachment: { attachmentId: 'a', mediaType: 'image/png', bytes: 13, sha256: 'a'.repeat(64), name: 'example.png' }, operationId: 'op', source: 'companion' }],
] as const

it.each(payloads)('preserves historical %s payload and ignorable envelope through the full catalog', (type, data) => {
  const row = { type, data, seq: 0, time: 2, ignorable: true }
  const source = JSON.stringify(row)
  const reader = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
  reader.decodeRow(row)
  expect(reader.finish().events).toEqual([row])
  expect(JSON.stringify(row)).toBe(source)
})

it.each(payloads)('rejects unexpected members of historical %s even when ignorable', (type, data) => {
  const reader = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
  const row = { type, data: { ...data, unsupported: true }, seq: 0, time: 2, ignorable: true }
  expect(() => { reader.decodeRow(row) }).toThrow(/unexpected member/)
})

it.each([
  ['browser/workspace', { workspaces: [], activeWorkspaceId: 'missing' }],
  ['browser/workspace', { workspaces: [{ workspaceId: 'w', profileId: 'p', browsers: [{ browserId: 'b', tabs: [{ tabId: 't', revision: -1 }], activeTabId: 't' }], activeBrowserId: 'b' }], activeWorkspaceId: 'w' }],
  ['member-question/asked', { ...payloads[1][1], questions: [{ id: 'q', question: 'Which?', options: [] }] }],
  ['member-question/outcome', { questionId: 'q', outcome: 'declined', answers: [] }],
  ['member-question/outcome', { questionId: 'q', outcome: 'answered', answers: [{ id: 'q', selected: [1] }] }],
  ['member-question/received', { ...payloads[3][1], origin: { ...payloads[3][1].origin, askerRole: 'unknown' } }],
  ['member-question/received', { ...payloads[3][1], cachedReferences: [{ path: 'doc', reason: '', cachedPath: 1 }] }],
  ['member-question/settled', { type: 'member-question-settled', operationId: 'op', questionId: 'q', settledAt: 21, outcome: 'answered' }],
  ['member-question/settled', { ...payloads[4][1], outcome: 'expired' }],
  ['session/attachment-admitted', { ...payloads[5][1], attachment: { ...payloads[5][1].attachment, sha256: 'invalid' } }],
  ['session/attachment-admitted', { ...payloads[5][1], attachment: { ...payloads[5][1].attachment, bytes: -1 } }],
  ['unregistered/local-event', {}],
] as const)('rejects malformed or unsupported %s without changing source', (type, data) => {
  const row = { type, data, seq: 0, time: 2, ignorable: true }
  const source = JSON.stringify(row)
  const reader = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
  expect(() => { reader.decodeRow(row) }).toThrow()
  expect(JSON.stringify(row)).toBe(source)
})

it.each(['declined', 'expired', 'withdrawn', 'superseded'] as const)('retains %s settlement with its exact claimant fields', (outcome) => {
  const data = { type: 'member-question-settled', operationId: 'op', questionId: 'q', settledAt: 21, outcome, ...(outcome === 'declined' ? { settledByInstallationId: 'installation', settledByDeviceName: '' } : {}) }
  const row = { type: 'member-question/settled', data, seq: 0, time: 2 }
  const reader = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
  reader.decodeRow(row)
  expect(reader.finish().events).toEqual([row])
})

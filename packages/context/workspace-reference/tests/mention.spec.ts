import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FsVersion, type FsPathInfo } from '@deepseek-ai/dsh-fs'
import {
  expandMentions,
  mentionPreStep,
  referenceForm,
  scanMentions,
} from '@deepseek-ai/dsh-workspace-reference'
import type { MentionFileSystem } from '@deepseek-ai/dsh-workspace-reference'

const SIGNAL = new AbortController().signal
const CWD = '/workspace'

function fsOf(map: Record<string, FsPathInfo['type'] | undefined>): MentionFileSystem {
  return {
    async lstat(path) {
      const type = map[path]
      if (type === undefined) return undefined
      return { version: FsVersion('v1'), type }
    },
  }
}

function userText(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('scanMentions', () => {
  it('collects unique @path tokens and strips a trailing slash', () => {
    expect(scanMentions('see @src/a.ts and @src/a.ts then @docs/')).toEqual(['src/a.ts', 'docs'])
  })

  it('does not treat a Session Reference mention as a path', () => {
    expect(scanMentions('compare @[other](dsh-session:abc) with @README.md')).toEqual(['README.md'])
  })

  it('ignores paste-marked @ tokens', () => {
    expect(scanMentions('see @\u2060README.md and @src/a.ts')).toEqual(['src/a.ts'])
  })

  it('escapes XML attribute characters in the marker', () => {
    expect(referenceForm('a&b<"c">', 'file'))
      .toBe('<workspace-reference path="a&amp;b&lt;&quot;c&quot;&gt;" kind="file" />')
  })
})

describe('expandMentions', () => {
  it('injects existence-only markers for files and directories inside cwd', async () => {
    const injections = await expandMentions(
      [userText('review @src/a.ts and @docs/')],
      CWD,
      fsOf({ 'src/a.ts': 'file', docs: 'directory' }),
      SIGNAL,
    )
    expect(injections.map(message => ({
      text: message.content[0]?.type === 'text' ? message.content[0].text : '',
      source: message.source,
    }))).toEqual([
      {
        text: referenceForm('src/a.ts', 'file'),
        source: { kind: 'workspace-reference', path: 'src/a.ts', pathKind: 'file' },
      },
      {
        text: referenceForm('docs', 'directory'),
        source: { kind: 'workspace-reference', path: 'docs', pathKind: 'directory' },
      },
    ])
  })

  it('skips missing, absolute, escaping, symlink, and non-user sources', async () => {
    const plugin = createUserMessage({
      content: [{ type: 'text', text: '@secret.ts' }],
      source: { kind: 'plugin', plugin: 'other' },
    })
    const injections = await expandMentions(
      [userText('try @missing.ts @/etc/passwd @../escape.ts @link.ts'), plugin],
      CWD,
      fsOf({ 'link.ts': 'symlink', 'secret.ts': 'file' }),
      SIGNAL,
    )
    expect(injections).toEqual([])
  })

  it('returns nothing for a relative cwd and ignores non-text blocks', async () => {
    const image = createUserMessage({
      content: [{ type: 'image', mimeType: 'image/png', data: 'x' } as never],
      source: { kind: 'user' },
    })
    expect(await expandMentions([image, userText('@README.md')], 'relative', fsOf({ 'README.md': 'file' }), SIGNAL)).toEqual([])
    expect(await expandMentions([image], CWD, fsOf({}), SIGNAL)).toEqual([])
    const injections = await expandMentions(
      [userText('@README.md'), userText('again @README.md')],
      CWD,
      fsOf({ 'README.md': 'file' }),
      SIGNAL,
    )
    expect(injections).toHaveLength(1)
  })
})

describe('mentionPreStep', () => {
  it('appends markers after a successful downstream enter', async () => {
    const claimed = [userText('open @README.md')]
    const decision = await mentionPreStep(
      CWD,
      fsOf({ 'README.md': 'file' }),
      claimed,
      SIGNAL,
      async () => ({ kind: 'enter', messages: claimed }),
    )
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[1]?.source).toEqual({
      kind: 'workspace-reference',
      path: 'README.md',
      pathKind: 'file',
    })
  })

  it('does not inject when downstream rejects', async () => {
    const decision = await mentionPreStep(
      CWD,
      fsOf({ 'README.md': 'file' }),
      [userText('open @README.md')],
      SIGNAL,
      async () => ({ kind: 'reject' }),
    )
    expect(decision).toEqual({ kind: 'reject' })
  })

  it('returns the downstream enter when no token validates', async () => {
    const claimed = [userText('no mentions')]
    const decision = await mentionPreStep(
      CWD,
      fsOf({}),
      claimed,
      SIGNAL,
      async () => ({ kind: 'enter', messages: claimed }),
    )
    expect(decision).toEqual({ kind: 'enter', messages: claimed })
  })
})

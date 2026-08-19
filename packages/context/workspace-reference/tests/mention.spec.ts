import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FsTargetKey, FsVersion, type FsPathInfo, type FsTarget } from '@deepseek-ai/dsh-fs'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import {
  confinedRelative,
  expandMentions,
  mentionPreStep,
  referenceForm,
  scanMentions,
} from '@deepseek-ai/dsh-workspace-reference'
import type { MentionFileSystem } from '@deepseek-ai/dsh-workspace-reference'

const SIGNAL = new AbortController().signal
const CWD = '/workspace'

function fsOf(
  map: Record<string, FsPathInfo['type'] | undefined>,
  realpaths: Record<string, string> = {},
): MentionFileSystem {
  const targetOf = (path: string, cwd = CWD): FsTarget => {
    const absolute = realpaths[path] ?? resolve(cwd, path)
    return { targetKey: FsTargetKey(absolute), displayPath: absolute }
  }
  return {
    async lstat(path) {
      const type = map[path]
      if (type === undefined) return undefined
      return { version: FsVersion('v1'), type }
    },
    async resolve(path, opts) {
      return targetOf(path, opts?.cwd)
    },
    contains(parent, child) {
      const rel = relative(parent.displayPath, child.displayPath)
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
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

  it('does not treat an email-like user@host.com as a path token', () => {
    expect(scanMentions('ping user@host.com then @src/a.ts')).toEqual(['src/a.ts'])
  })

  it('escapes XML attribute characters in the marker', () => {
    expect(referenceForm('a&b<"c">', 'file'))
      .toBe('<workspace-reference path="a&amp;b&lt;&quot;c&quot;&gt;" kind="file" />')
  })
})

describe('confinedRelative', () => {
  it('keeps a basename that contains .. as characters', () => {
    expect(confinedRelative(CWD, 'foo..bar.ts')).toBe('foo..bar.ts')
  })

  it('collapses foo/../bar onto bar inside cwd', () => {
    expect(confinedRelative(CWD, 'foo/../bar.ts')).toBe('bar.ts')
  })

  it('rejects absolute, UNC, and Windows drive-relative tokens on every platform', () => {
    expect(confinedRelative(CWD, '/etc/passwd')).toBeUndefined()
    expect(confinedRelative(CWD, 'C:/Windows/notepad.exe')).toBeUndefined()
    expect(confinedRelative(CWD, 'C:\\Windows\\notepad.exe')).toBeUndefined()
    expect(confinedRelative(CWD, '\\\\server\\share\\secret')).toBeUndefined()
    expect(confinedRelative(CWD, 'C:foo')).toBeUndefined()
    expect(confinedRelative(CWD, 'foo/../../etc/passwd')).toBeUndefined()
    expect(confinedRelative(CWD, '')).toBeUndefined()
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

  it('rejects a file reached through an intermediate symlink that leaves cwd', async () => {
    const injections = await expandMentions(
      [userText('open @evil/passwd')],
      CWD,
      fsOf(
        { 'evil/passwd': 'file', evil: 'symlink' },
        { '.': CWD, 'evil/passwd': '/etc/passwd' },
      ),
      SIGNAL,
    )
    expect(injections).toEqual([])
  })

  it('injects the confined path for foo/../bar and a foo..bar.ts basename', async () => {
    const injections = await expandMentions(
      [userText('see @foo/../bar.ts and @foo..bar.ts')],
      CWD,
      fsOf({ 'bar.ts': 'file', 'foo..bar.ts': 'file' }),
      SIGNAL,
    )
    expect(injections.map(message => message.source)).toEqual([
      { kind: 'workspace-reference', path: 'bar.ts', pathKind: 'file' },
      { kind: 'workspace-reference', path: 'foo..bar.ts', pathKind: 'file' },
    ])
  })

  it('treats @. as the workspace directory', async () => {
    const injections = await expandMentions(
      [userText('open @.')],
      CWD,
      fsOf({ '.': 'directory' }),
      SIGNAL,
    )
    expect(injections.map(message => message.source)).toEqual([
      { kind: 'workspace-reference', path: '.', pathKind: 'directory' },
    ])
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

describe('expandMentions with LocalFileSystem', () => {
  let dir: string
  let outside: string
  let ctx: Context
  let fiber: Awaited<ReturnType<Context['plugin']>>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-wsref-mention-'))
    outside = await mkdtemp(join(tmpdir(), 'dsh-wsref-outside-'))
    ctx = new Context()
    fiber = await ctx.plugin(LocalFileSystem, { cwd: dir })
  })

  afterEach(async () => {
    await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('rejects a file reached through an intermediate symlink out of the workspace', async () => {
    await writeFile(join(outside, 'passwd'), 'secret\n')
    await symlink(outside, join(dir, 'evil'))
    const injections = await expandMentions(
      [userText('open @evil/passwd')],
      dir,
      ctx.fs,
      SIGNAL,
    )
    expect(injections).toEqual([])
  })

  it('accepts a lexically collapsed path and a basename containing ..', async () => {
    await writeFile(join(dir, 'bar.ts'), 'export {}\n')
    await writeFile(join(dir, 'foo..bar.ts'), 'export {}\n')
    const injections = await expandMentions(
      [userText('see @foo/../bar.ts and @foo..bar.ts')],
      dir,
      ctx.fs,
      SIGNAL,
    )
    expect(injections.map(message => message.source)).toEqual([
      { kind: 'workspace-reference', path: 'bar.ts', pathKind: 'file' },
      { kind: 'workspace-reference', path: 'foo..bar.ts', pathKind: 'file' },
    ])
  })
})

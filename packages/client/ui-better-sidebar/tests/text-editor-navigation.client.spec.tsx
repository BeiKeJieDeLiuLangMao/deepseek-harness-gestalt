// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session/types'

interface FakeViewRecord {
  destroyed: boolean
  lineReads: number
}

const editor = vi.hoisted(() => ({ instances: [] as FakeViewRecord[] }))

vi.mock('@codemirror/state', () => {
  class FakeDoc {
    readonly value: string
    readonly starts: number[]

    constructor(value: string) {
      this.value = value
      this.starts = [0]
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] === '\n') this.starts.push(index + 1)
      }
    }

    get length(): number { return this.value.length }
    get lines(): number { return this.starts.length }
    line(number: number): { from: number } { return { from: this.starts[number - 1] ?? 0 } }
    lineAt(position: number): { number: number } {
      return { number: this.starts.filter(start => start <= position).length }
    }
    toString(): string { return this.value }
  }

  class FakeEditorState {
    static tabSize = { of: () => ({}) }
    static create(options: { doc: string }): FakeEditorState { return new FakeEditorState(options.doc) }
    readonly doc: FakeDoc
    selection = { main: { from: 0, to: 0, head: 0, empty: true } }

    constructor(value: string) { this.doc = new FakeDoc(value) }
    sliceDoc(from: number, to: number): string { return this.doc.value.slice(from, to) }
  }

  return { EditorState: FakeEditorState }
})

vi.mock('@codemirror/view', () => {
  class FakeEditorView implements FakeViewRecord {
    static lineWrapping = {}
    static contentAttributes = { of: () => ({}) }
    static updateListener = { of: () => ({}) }
    readonly state: {
      doc: { line(number: number): { from: number }; lines: number; toString(): string }
      selection: { main: { from: number; to: number; head: number; empty: boolean } }
    }
    readonly scrollDOM = document.createElement('div')
    destroyed = false
    lineReads = 0
    hasFocus = false

    constructor(options: { state: FakeEditorView['state']; parent: HTMLElement }) {
      this.state = options.state
      options.parent.append(this.scrollDOM)
      editor.instances.push(this)
    }

    dispatch(spec: { selection?: { anchor: number } }): void {
      if (spec.selection !== undefined) {
        const anchor = spec.selection.anchor
        this.state.selection.main = { from: anchor, to: anchor, head: anchor, empty: true }
      }
    }

    requestMeasure(): void {
      if (this.destroyed) throw new Error('measured a destroyed editor')
    }

    lineBlockAt(): { top: number } {
      if (this.destroyed) throw new Error('read a destroyed editor')
      this.lineReads += 1
      return { top: 120 }
    }

    coordsAtPos(): null { return null }
    destroy(): void { this.destroyed = true; this.scrollDOM.remove() }
  }

  return {
    EditorView: FakeEditorView,
    keymap: { of: () => ({}) },
    lineNumbers: () => ({}),
  }
})

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => ({}),
  historyKeymap: [],
}))
vi.mock('../src/client/cm-themes.ts', () => ({
  cmSurfaceTheme: {},
  CmThemeCompartment: class {
    of(): object { return {} }
    reconfigure(): object { return {} }
  },
}))
vi.mock('../src/client/lang.ts', () => ({ languageForPath: () => null }))
vi.mock('../src/client/MarkdownHtml.tsx', () => ({
  LazyMermaidMarkdown: () => null,
  MarkdownDocument: () => null,
}))
vi.mock('../src/client/md-toc.tsx', () => ({ MdToc: () => null }))

import { TextEditorCore, type TextEditorCoreProps } from '../src/client/TextEditor.tsx'

const scope = { sessionId: SessionId('editor-session'), cwd: '/work' }
const content = Array.from({ length: 120 }, (_, index) => `line ${String(index + 1)}`).join('\n')

function props(path: string, line: number | undefined): TextEditorCoreProps {
  return {
    scope,
    path,
    title: path,
    viewerId: 'code',
    content,
    writeFile: () => Promise.resolve(),
    insertIntoConversation: () => {},
    htmlSafety: { forceUnsandboxed: false, defaultUnsandboxed: false },
    ...(line === undefined ? {} : { line, navigationRevision: 1 }),
  }
}

describe('TextEditor delayed line navigation', () => {
  let frames: Map<number, FrameRequestCallback>
  let cancelled: Set<number>
  let nextFrame: number

  beforeEach(() => {
    editor.instances.length = 0
    frames = new Map()
    cancelled = new Set()
    nextFrame = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame
      nextFrame += 1
      frames.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelled.add(id)
      frames.delete(id)
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each(['switches files', 'unmounts'] as const)(
    'cancels the second reveal frame when the editor %s',
    (transition) => {
      const view = render(<TextEditorCore {...props('first.txt', 80)} />)
      const oldEditor = editor.instances[0]
      expect(oldEditor).toBeDefined()
      expect(frames.size).toBe(1)

      const firstFrame = frames.entries().next().value as [number, FrameRequestCallback]
      frames.delete(firstFrame[0])
      act(() => { firstFrame[1](0) })
      const secondFrame = frames.keys().next().value as number
      expect(secondFrame).toBeTypeOf('number')

      if (transition === 'switches files') {
        view.rerender(<TextEditorCore {...props('second.txt', undefined)} />)
      } else {
        view.unmount()
      }

      expect(cancelled).toContain(secondFrame)
      expect(frames.has(secondFrame)).toBe(false)
      expect(oldEditor?.destroyed).toBe(true)
      expect(oldEditor?.lineReads).toBe(0)
    },
  )
})

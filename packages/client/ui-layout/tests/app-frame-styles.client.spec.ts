/**
 * Center-column clip contract as CSS text. `overflow: hidden` makes the
 * column a scrollport, so trajectory `scrollIntoView({ block: 'center' })`
 * can slide the session header under the window chrome.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')
const declarationText = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

function declarations(selector: string): string[] {
  const rule = new RegExp(`(?:^|\\})\\s*\\${selector}\\s*\\{([^{}]*)\\}`).exec(declarationText)
  if (rule === null) throw new Error(`AppFrame.module.css has no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('AppFrame.module.css overflow clip', () => {
  it('clips the center column without creating a scrollport', () => {
    expect(declarations('.centerCol')).toEqual(expect.arrayContaining(['overflow: clip']))
    expect(declarations('.centerCol')).not.toEqual(expect.arrayContaining(['overflow: hidden']))
    expect(declarations('.conversationHost')).toEqual(expect.arrayContaining(['overflow: clip']))
    expect(declarations('.conversationHost')).not.toEqual(expect.arrayContaining(['overflow: hidden']))
  })
})

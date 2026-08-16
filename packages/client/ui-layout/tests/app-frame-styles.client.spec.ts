/** Desktop chrome inset declarations of AppFrame CSS. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('AppFrame.module.css', () => {
  it('declares a 28px center-column inset only for the macOS Desktop marker', () => {
    const mac = declarations(".frame:has([data-desktop-chrome='mac']) .centerCol")
    expect(mac?.get('padding-top')).toBe('28px')
    expect(mac?.get('box-sizing')).toBe('border-box')
    expect(declarations(".frame:has([data-desktop-chrome='win']) .centerCol")).toBeUndefined()
    expect(declarations('.centerCol')?.has('padding-top')).toBe(false)
  })
})

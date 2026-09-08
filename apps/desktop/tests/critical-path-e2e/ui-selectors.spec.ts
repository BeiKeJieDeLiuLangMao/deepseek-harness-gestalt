/** DOM regressions for the product controls used by the Electron driver. */

import { JSDOM } from 'jsdom'
import { expect, it } from 'vitest'
import { EDIT_PATH_BUTTON_SELECTOR, TASKS_TAB_SELECTOR } from './ui-selectors.ts'

it('finds the icon-only path editor without matching its textbox or another action', () => {
  const dom = new JSDOM(`
    <button aria-label="Close" id="window-close">×</button>
    <button aria-label="Edit path" id="outside"></button>
    <section role="dialog" aria-label="Select Workspace Directory">
      <button aria-label="Edit path" title="Edit path" id="edit"><svg aria-hidden="true"><path /></svg></button>
      <input aria-label="Edit path" />
      <button aria-label="Different action" id="different-action">Edit path</button>
      <button>Edit path later</button>
    </section>
  `)
  try {
    const root = dom.window.document.querySelector('section')!
    expect(matchingIds(root, EDIT_PATH_BUTTON_SELECTOR)).toEqual(['edit'])
  } finally {
    dom.window.close()
  }
})

it('selects the panel Tasks tab independently of its badge and nested close control', () => {
  const dom = new JSDOM(`
    <div title="Tasks" id="outside">Tasks</div>
    <section>
      <div title="Tasks" id="tasks"><span>2</span><span>Tasks</span><button aria-label="Close"><svg /></button></div>
      <button id="other-tasks-action">Tasks</button>
      <div title="Other Tasks">Other Tasks</div>
    </section>
  `)
  try {
    const root = dom.window.document.querySelector('section')!
    expect(matchingIds(root, TASKS_TAB_SELECTOR)).toEqual(['tasks'])
  } finally {
    dom.window.close()
  }
})

function matchingIds(root: Element, selector: string): string[] {
  const resultType = root.ownerDocument.defaultView!.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
  const matches = root.ownerDocument.evaluate(selector, root, null, resultType, null)
  return Array.from({ length: matches.snapshotLength }, (_, index) => (matches.snapshotItem(index) as Element).id)
}

/** Keyboard interaction for the directory picker's path editor. */

import { Key } from 'webdriverio'

/**
 * Replace the path draft while retaining the editor's keyboard focus.
 * @param browser - browser owning the current editor window.
 * @param input - live path editor in the directory picker.
 * @param value - complete replacement path, preserving whitespace.
 */
export async function replacePathInput(
  browser: WebdriverIO.Browser,
  input: WebdriverIO.Element,
  value: string,
): Promise<void> {
  await input.waitForClickable({ timeout: 10_000 })
  await input.click()
  if (!await input.isFocused()) throw new Error('Directory path editor did not receive keyboard focus')
  await browser.keys([Key.Ctrl, 'a'])
  await browser.keys(value)
  if (!await input.isFocused() || await input.getValue() !== value) {
    throw new Error('Directory path editor did not retain the replacement text and keyboard focus')
  }
}

/** Real Session Surface playback evidence; stale decoder injection remains component-only. */
import { browser, expect } from '@wdio/globals'
import {
  assertStartupEvidence, openSession, openPhoneTabFromPlusMenu, clickSurfaceButton,
  recordOwnedProcesses, saveWindowEvidence, writeArtifact,
} from './helpers.ts'

async function control(action: 'hold' | 'paint' | 'fail'): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${process.env.DSH_ELECTRON_E2E_FAKE_PORT}/__test/h264/${action}`, {
    method: 'POST', signal: AbortSignal.timeout(2_000),
  })
  if (!response.ok) throw new Error(`fixture control ${action}: HTTP ${response.status}`)
}

async function waiting(): Promise<void> {
  await browser.$('[aria-label="画面状态 等待 H264 首帧"]').waitForDisplayed({ timeout: 10_000 })
  await expect(browser.$('[aria-label="当前画面编码 H264"]')).not.toBeExisting()
  const text = await browser.$('body').getText()
  expect(text).not.toContain('30 fps')
  expect(text).not.toContain('代理中')
}

async function painted(name: string): Promise<void> {
  await browser.waitUntil(async () => await browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('div[role="application"] canvas')
    if (!canvas || canvas.width < 2 || canvas.height < 2 || canvas.getBoundingClientRect().width === 0) return false
    const context = canvas.getContext('2d')
    if (!context) throw new Error('current phone canvas does not expose 2D pixels')
    const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data
    const first = bytes.slice(0, 3)
    for (let offset = 4; offset < bytes.length; offset += 4) {
      if (bytes[offset] !== first[0] || bytes[offset + 1] !== first[1] || bytes[offset + 2] !== first[2]) return true
    }
    return false
  }), { timeout: 15_000, timeoutMsg: 'current phone canvas never painted nonuniform decoded pixels' })
  await expect(browser.$('[aria-label="当前画面编码 H264"]')).toBeExisting()
  await saveWindowEvidence(name)
}

describe('Prebuilt hidden #610 phone playback', () => {
  it('waits for actual H264 paint, falls back visibly, and refreshes into a waiting owner', async () => {
    const startup = await assertStartupEvidence()
    await recordOwnedProcesses(startup.hostPid, true)
    await openSession()
    await openPhoneTabFromPlusMenu()
    await clickSurfaceButton('iOS')
    await browser.$('div*=Acceptance iPhone').waitForDisplayed()
    await clickSurfaceButton('打开')
    await waiting()
    await saveWindowEvidence('610-waiting')
    await control('paint')
    await painted('610-h264-painted')
    await control('fail')
    await browser.$('[aria-label="当前画面编码 MJPEG"]').waitForExist({ timeout: 20_000 })
    const image = await browser.execute(() => {
      const image = document.querySelector<HTMLImageElement>('img[alt="Acceptance iPhone 实时画面"]')
      if (!image || !image.complete || image.naturalWidth === 0) throw new Error('MJPEG has no decoded image')
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const varied = pixels.some((value, index) => index % 4 !== 3 && value !== pixels[index % 4])
      return { width: image.naturalWidth, height: image.naturalHeight, visibleWidth: image.getBoundingClientRect().width, varied }
    })
    expect(image.varied).toBe(true)
    expect(image.visibleWidth).toBeGreaterThan(0)
    await writeArtifact('610-mjpeg.json', image)
    await saveWindowEvidence('610-mjpeg-painted')
    await control('hold')
    await clickSurfaceButton('刷新流')
    await waiting()
    await saveWindowEvidence('610-refresh-waiting')
    await control('paint')
    await painted('610-refresh-painted')
  })
})

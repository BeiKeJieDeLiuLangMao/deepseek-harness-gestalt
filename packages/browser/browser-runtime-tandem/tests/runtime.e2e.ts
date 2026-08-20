import { describe, expect, it } from 'vitest'

// Real Tandem.app launch is out of scope. Production Desktop drives the
// in-process Electron engine through this package's HTTP protocol client;
// protocol coverage lives in the HTTP fixture unit suite. Electron-gated e2e
// lives in dsh-browser-runtime-electron and also never spawns Tandem.app.
describe.skip('Tandem Browser Runtime real-runtime e2e', () => {
  it('does not spawn Tandem.app; protocol coverage is the HTTP fixture', () => {
    expect(process.env.DSH_TANDEM_BIN).toBeUndefined()
  })
})

/**
 * Physical files for a loader-delivered browser plugin. The HTTP module host
 * serves these factories through its stable `/client.js` route.
 */
export const DYNAMIC_CLIENT_ARTIFACT = {
  entryFileName: 'client.js',
  exportPath: './lib/client.js',
  relativePath: 'lib/client.js',
  sourceMapPath: 'lib/client.js.map',
} as const

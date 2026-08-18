import { fileURLToPath } from 'node:url'
import { defineConfig } from '../../web/node_modules/vite/dist/node/index.js'

const prototypeRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const webModules = fileURLToPath(new URL('../../web/node_modules/', import.meta.url))

export default defineConfig({
  root: prototypeRoot,
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      { find: 'react/jsx-runtime', replacement: `${webModules}react/jsx-runtime.js` },
      { find: 'react/jsx-dev-runtime', replacement: `${webModules}react/jsx-dev-runtime.js` },
      { find: 'react-dom/client', replacement: `${webModules}react-dom/client.js` },
      { find: /^react-dom$/, replacement: `${webModules}react-dom/index.js` },
      { find: /^react$/, replacement: `${webModules}react/index.js` },
    ],
  },
  server: {
    fs: { allow: [repositoryRoot] },
  },
})

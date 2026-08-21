// PROTOTYPE — same-origin view of the already-running DSH Web Host.

import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../..', import.meta.url))
const dshTarget = 'http://127.0.0.1:3080';

export default {
  root,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [repo] },
    proxy: {
      '/dsh': {
        target: dshTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dsh/, '') || '/',
      },
      '/assets': { target: dshTarget, changeOrigin: true },
      '/plugins': { target: dshTarget, changeOrigin: true },
      '/api': { target: dshTarget, changeOrigin: true, ws: true },
      '/manifest.webmanifest': { target: dshTarget, changeOrigin: true },
      '/favicon.svg': { target: dshTarget, changeOrigin: true },
    },
  },
};

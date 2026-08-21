import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/boot.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: true,
  copy: [{
    from: '../../packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm',
    to: 'dist',
  }],
  deps: {
    neverBundle: ['pg', 'redis'],
    alwaysBundle: [/^@deepseek-ai\//],
  },
})

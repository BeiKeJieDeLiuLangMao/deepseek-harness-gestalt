import { defineConfig } from 'tsdown'

/** Browser-safe root faces and the host-only Relay provider are independent
 *  bundles. The provider imports `RemoteRelayError` from the public package
 *  entry so Consumers that map that class share one constructor. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/invariant.js'],
    outDir: 'lib', format: ['esm'], platform: 'browser', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
  },
  {
    entry: ['lib/types/relay-provider.js'],
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
    deps: { neverBundle: ['@deepseek-ai/dsh-remote-access'] },
  },
])

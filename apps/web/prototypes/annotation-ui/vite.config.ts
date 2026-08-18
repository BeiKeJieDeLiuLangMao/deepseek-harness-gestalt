import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const src = (relativePath: string): string => fileURLToPath(new URL(relativePath, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@deepseek-ai\/dsh-client-ui-theme\/styles\//,
        replacement: `${src('../../../../packages/client/ui-theme/src/styles/')}/`,
      },
      {
        find: /^@deepseek-ai\/dsh-client-ui-primitives$/,
        replacement: src('../../../../packages/client/ui-primitives/src/index.ts'),
      },
    ],
  },
})

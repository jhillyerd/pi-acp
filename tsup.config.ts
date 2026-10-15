import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: true,
    dts: false,
    splitting: false,
    minify: false,
    banner: {
      js: '#!/usr/bin/env node'
    }
  },
  {
    // Loaded inside the user's pi process via `pi --extension`; must stay a
    // standalone file with no imports from the adapter bundle.
    entry: { 'mcp-bridge': 'src/pi-extension/mcp-bridge.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    clean: false,
    dts: false,
    splitting: false,
    minify: false
  }
])

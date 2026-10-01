import { defineConfig } from 'tsup';

// The SDK the apps install (ADR-008): CommonJS for News' desktop/main.js, ESM for bundlers, and
// the type declarations. Node built-ins only, nothing bundled from npm.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['cjs', 'esm'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
  dts: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  sourcemap: false,
});

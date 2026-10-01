import { defineConfig } from 'tsup';

// Main process and preload, bundled to CommonJS. `electron` stays external so the packaged app
// uses Electron's built-in module instead of the npm stub.
export default defineConfig({
  entry: ['src/electron/main.ts', 'src/electron/preload.ts'],
  format: ['cjs'],
  outDir: 'dist/electron',
  // sql.js stays in node_modules: it locates its WASM binary next to its own files.
  external: ['electron', 'sql.js'],
  sourcemap: true,
  clean: false,
  target: 'node22',
  platform: 'node',
});

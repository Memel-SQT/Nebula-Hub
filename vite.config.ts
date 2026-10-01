import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const resolvePath = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Content-Security-Policy for the packaged renderer only (same approach as Nebula Finterest):
 * the dev server needs inline scripts for React refresh, so the policy is injected at build
 * time. The renderer never touches the network: catalog, downloads and Nebula Link all go
 * through the main process (rule R05), hence `connect-src 'none'`.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' 'unsafe-inline' file:",
  "img-src 'self' file: data: blob:",
  "font-src 'self' file: data:",
  "connect-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'nebula-hub-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`),
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  root: '.',
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  resolve: {
    alias: [
      { find: '@shared', replacement: resolvePath('./src/shared') },
      { find: '@renderer', replacement: resolvePath('./src/renderer') },
      { find: '@nebula/design/react', replacement: resolvePath('./packages/nebula-design/src/react.ts') },
      { find: '@nebula/design/styles.css', replacement: resolvePath('./packages/nebula-design/src/styles/index.css') },
      { find: '@nebula/design', replacement: resolvePath('./packages/nebula-design/src/index.ts') },
    ],
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});

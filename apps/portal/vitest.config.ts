import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// No vite plugins on purpose: esbuild already transforms TSX with the automatic
// JSX runtime, and plugin types (e.g. @vitejs/plugin-react, vite-tsconfig-paths)
// can clash with vitest's bundled vite during Next's build-time typecheck on
// Vercel. Aliases are mirrored by hand from tsconfig instead — see
// apps/framework-editor/vitest.config.ts for the same approach.
export default defineConfig({
  // The design system ships TSX source that relies on the automatic JSX runtime;
  // without this, dependencies transformed by esbuild expect a global `React`.
  esbuild: { jsx: 'automatic' },
  test: {
    // jsdom, not node: the include glob covers component tests (.jsx/.tsx) that
    // need DOM APIs (e.g. testing-library's render). Matches apps/app and
    // apps/framework-editor. Node-only tests run fine under jsdom too.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
  },
  resolve: {
    // Mirror the tsconfig path aliases so tests can import via `@/...` and the
    // `@db`/`@db/server` prisma aliases. `@db/server` must precede `@db` so the
    // more specific alias wins. (Modules importing prisma are mocked in tests.)
    alias: {
      '@db/server': resolve(__dirname, './prisma/server'),
      '@db': resolve(__dirname, './prisma'),
      '@': resolve(__dirname, './src'),
      // Mirror the `@trycompai/ui/*` tsconfig paths too: the package's exports
      // point at its build output, which component tests should not depend on.
      // The `cn` entry must precede the package prefix so it wins.
      '@trycompai/ui/cn': resolve(__dirname, '../../packages/ui/src/utils/cn.ts'),
      '@trycompai/ui': resolve(__dirname, '../../packages/ui/src/components'),
    },
  },
});

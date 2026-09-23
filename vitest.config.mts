import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Compiled electron/tests/*.test.js can end up in dist/ from a stale
    // build before tsconfig.electron.json excluded electron/tests — make
    // sure vitest only ever runs source .test.ts files.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});

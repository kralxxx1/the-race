/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any sub-path (GitHub Pages, itch.io, file servers).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  // Agent worktrees live under .claude/; never watch them from the main dev server.
  server: { host: true, watch: { ignored: ['**/.claude/**'] } },
  preview: { host: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

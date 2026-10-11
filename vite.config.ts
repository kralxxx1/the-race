/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Agent worktrees live under .claude/worktrees: the main checkout must not watch them,
// but a dev server started inside a worktree must still watch its own files.
const insideWorktree = fileURLToPath(new URL('.', import.meta.url)).includes('/.claude/');

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
  server: { host: true, watch: { ignored: insideWorktree ? [] : ['**/.claude/**'] } },
  preview: { host: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

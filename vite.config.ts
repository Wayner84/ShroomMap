import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ShroomMap/',   // 👈 must match your repo name
  build: {
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    coverage: {
      reporter: ['text', 'html']
    }
  }
});

import { defineConfig } from 'vite';

export default defineConfig({
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

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Inside the dev container the source is a bind mount from the host, where
// native file events don't cross the VM boundary (notably on Windows/macOS),
// so fall back to polling there.
const inDocker = process.env.DOCKER_DEV === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: inDocker ? { usePolling: true, interval: 300 } : undefined,
    fs: {
      // The dev server serves files from the project root. Never serve bank
      // exports even if they sit next to the code.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.csv', '**/data/**'],
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

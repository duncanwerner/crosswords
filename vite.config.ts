import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  plugins: [solid()],
  test: {
    // model tests are pure TS; no DOM needed
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

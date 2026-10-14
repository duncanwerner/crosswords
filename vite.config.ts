import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  plugins: [solid()],
  // the dependency scan starts from index.html and doesn't follow `?worker`
  // imports, so the LLM worker's SDKs (some CommonJS) went unbundled in dev
  // and the worker failed to load. scan the worker too.
  optimizeDeps: { entries: ['index.html', 'node_modules/llm-support-core/src/llm-worker.ts'] },
  test: {
    // model tests are pure TS; no DOM needed
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

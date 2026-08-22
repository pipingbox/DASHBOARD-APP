import { defineConfig } from '@playwright/test';

/**
 * Permanent browser smoke test config for the Cloudflare Workers preview
 * (and, later, any other deployed target). A plain HTTP 200 from curl does
 * NOT prove the SPA booted -- Vite embeds VITE_* env vars at build time, and
 * a missing var throws in a top-level module before React ever mounts,
 * producing a blank page while every asset still returns 200.
 *
 * Usage:
 *   set PREVIEW_URL=https://pipingbox-app.pipingbox.workers.dev
 *   npx playwright test --config=playwright.config.ts
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PREVIEW_URL || 'https://pipingbox-app.pipingbox.workers.dev',
    trace: 'retain-on-failure',
  },
});

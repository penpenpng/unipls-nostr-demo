import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4175/unipls-nostr-demo/' },
  webServer: { command: 'pnpm dev --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175/unipls-nostr-demo/', reuseExistingServer: !process.env.CI },
});

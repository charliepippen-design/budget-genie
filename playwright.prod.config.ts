import { defineConfig, devices } from '@playwright/test';

// Runs against a real minified production build (mode qa, Clerk mocked), not the dev server.
// Catches problems that only exist in the bundled output: chunk loading, minification, caching.
export default defineConfig({
  testDir: './tests/e2e-prod',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  webServer: {
    command:
      'MOCK_CLERK=1 npx vite build --mode qa --outDir dist-qa && npx vite preview --outDir dist-qa --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_stub',
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub',
    },
    reuseExistingServer: false,
    timeout: 240_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

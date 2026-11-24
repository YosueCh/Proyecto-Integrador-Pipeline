import { defineConfig, devices } from '@playwright/test';

// BASE_URL apunta al frontend (nginx), que tambien reenvia /api al backend.
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8088';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false, // comparten la misma base de datos: se ejecutan en orden
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'api', testMatch: /api\..*\.spec\.ts/ },
    { name: 'ui-chromium', testMatch: /ui\..*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'ui-firefox', testMatch: /ui\..*\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
  ],
});

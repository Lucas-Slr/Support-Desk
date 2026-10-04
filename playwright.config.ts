import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://localhost:4200', trace: 'off', screenshot: 'only-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:3100/api/v1/health',
      env: { HOST: '127.0.0.1', PORT: '3100' },
      stdout: 'pipe',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'npm run dev:web',
      url: 'http://localhost:4200',
      // Angular donne priorité à PORT, même si --port est fourni dans le script npm.
      env: { PORT: '4200' },
      stdout: 'pipe',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});

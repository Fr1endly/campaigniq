import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        channel: 'chrome',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace @campaign-iq/api',
      cwd: '../..',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace @campaign-iq/web',
      cwd: '../..',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})

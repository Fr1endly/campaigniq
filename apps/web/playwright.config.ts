import { defineConfig, devices } from '@playwright/test'

const webPort = Number(process.env.E2E_WEB_PORT ?? 3000)
const apiPort = Number(process.env.E2E_API_PORT ?? 3001)
const webOrigin = `http://localhost:${webPort}`
const apiOrigin = `http://localhost:${apiPort}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webOrigin,
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
      url: `${apiOrigin}/api/health`,
      env: {
        ...process.env,
        API_PORT: String(apiPort),
        WEB_ORIGIN: webOrigin,
        BETTER_AUTH_URL: webOrigin,
      },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npm run dev --workspace @campaign-iq/web -- --port ${webPort}`,
      cwd: '../..',
      url: `${webOrigin}/login`,
      env: {
        ...process.env,
        API_INTERNAL_URL: apiOrigin,
      },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})

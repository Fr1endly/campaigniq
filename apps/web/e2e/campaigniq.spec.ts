import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { resolve } from 'node:path'

const email = process.env.DEMO_USER_EMAIL ?? 'demo@campaigniq.local'
const password = process.env.DEMO_USER_PASSWORD ?? 'CampaignIQ2026!'

async function waitForHydration(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  })
}

async function signIn(page: Page) {
  await page.goto('/login')
  await waitForHydration(page)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/overview\?range=30d/)
  await waitForHydration(page)
}

test('protects analytics routes and handles invalid login', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/dashboard/summary?range=30d')
  expect(response.status()).toBe(401)

  await page.goto('/overview?range=30d')
  await expect(page).toHaveURL(/\/login/)
  await waitForHydration(page)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page
    .getByRole('textbox', { name: 'Password' })
    .fill('incorrect-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText(/incorrect|invalid/i)
})

test('shows seeded overview data and changes reporting range', async ({
  page,
}, testInfo) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('$1.6M')).toBeVisible()
  await expect(page.getByText('5.46x')).toBeVisible()
  await expect(page.getByRole('row', { name: /Summer Search/ })).toBeVisible()
  await expect(
    page.locator('[data-testid="performance-chart"] svg'),
  ).toBeVisible()
  expect(
    await page.locator('[data-testid="performance-chart"] path').count(),
  ).toBeGreaterThan(1)

  await page.getByRole('radio', { name: '7 days' }).click()
  await expect(page).toHaveURL(/range=7d/)
  await expect(page.getByText(/Aug 21, 2026/)).toBeVisible()
  await page.getByRole('radio', { name: '7-day avg' }).click()
  await expect(page).toHaveURL(/trend=rolling7/)
  await expect(
    page.getByRole('heading', { name: 'Campaign momentum' }),
  ).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Movement' }),
  ).toBeVisible()

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('overview.png'),
    fullPage: true,
  })
})

test('filters campaigns and opens campaign details', async ({ page }) => {
  await signIn(page)
  const mobileMenu = page.getByRole('button', { name: 'Open navigation' })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  await page.getByRole('link', { name: 'Campaigns' }).click()
  await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible()

  await page.getByLabel('Search campaigns').fill('Summer')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('search'))
    .toBe('Summer')
  await expect(page.getByRole('row', { name: /Summer Search/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Cart Recovery/ })).toHaveCount(0)

  await page.getByRole('link', { name: 'Summer Search', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Summer Search' }),
  ).toBeVisible()
  await expect(page.getByText('CAMP001', { exact: false })).toBeVisible()
  await expect(
    page.locator('[data-testid="performance-chart"] svg'),
  ).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(30)
})

test('uploads a CSV, processes it, and exposes its quality report', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await signIn(page)
  const mobileMenu = page.getByRole('button', { name: 'Open navigation' })
  if (await mobileMenu.isVisible()) await mobileMenu.click()
  await page.getByRole('link', { name: 'Imports' }).click()
  await expect(page.getByRole('heading', { name: 'Imports' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Warehouse status' }),
  ).toBeVisible()
  await expect(page.getByText('Reporting current')).toBeVisible()

  await page
    .getByLabel('Choose CSV file')
    .setInputFiles(
      resolve(
        import.meta.dirname,
        './fixtures/duplicate.csv',
      ),
    )
  await page.getByRole('button', { name: 'Upload and process' }).click()
  const uploadPanel = page.getByRole('region', {
    name: 'Upload campaign data',
  })
  await expect(uploadPanel.getByText('Completed', { exact: true })).toBeVisible(
    {
      timeout: 30_000,
    },
  )
  await expect(uploadPanel.getByText(/Loaded 2 rows; rejected 1/)).toBeVisible()
  await expect(uploadPanel.getByText(/new,.*changed,.*unchanged/)).toBeVisible()

  const completedRow = page
    .getByRole('row')
    .filter({ hasText: 'duplicate.csv' })
    .filter({ hasText: 'Completed' })
    .first()
  await expect(completedRow).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'New' })).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Changed', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Unchanged' }),
  ).toBeVisible()
  await completedRow.getByRole('link', { name: 'Inspect' }).click()
  await expect(
    page.getByRole('heading', { name: 'Data Quality' }),
  ).toBeVisible()
  await expect(page.getByText('66.67%')).toBeVisible()
  await expect(
    page.getByRole('cell', { name: 'Duplicate input record' }),
  ).toBeVisible()

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

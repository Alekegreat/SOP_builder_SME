// @ts-nocheck
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: 'query_id=abc&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Test%22%7D&auth_date=1893456000&hash=fake',
      },
    };
  });

  await page.route('**/auth/telegram', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-token',
        workspaceId: 'ws-1',
        user: { id: 'u-1', name: 'Test User', telegramUserId: 1 },
      }),
    });
  });

  await page.route('**/sops?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], total: 0, limit: 20, offset: 0 }),
    });
  });

  await page.route('**/approvals/inbox?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/billing/plan?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: 'FREE',
        creditsIncluded: 0,
        creditsBought: 0,
        creditsUsed: 0,
        creditsRemaining: 0,
        currentPeriod: '202602',
      }),
    });
  });
});

test('loads dashboard and navigates to SOP library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('SOP Builder Dashboard')).toBeVisible();
  await page.getByRole('link', { name: 'My SOPs' }).click();
  await expect(page.getByRole('heading', { name: 'SOPs' })).toBeVisible();
});

test('opens analytics from dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
});

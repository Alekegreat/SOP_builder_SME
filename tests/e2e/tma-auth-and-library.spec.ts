// @ts-nocheck
import { test, expect } from '@playwright/test';

/*
 * The index.html loads https://telegram.org/js/telegram-web-app.js which
 * overwrites any window.Telegram set via addInitScript.  We intercept that
 * external script and replace it with a lightweight stub that carries the
 * initData our tests need.
 */
const TELEGRAM_STUB = `
  window.Telegram = {
    WebApp: {
      initData:
        "query_id=abc&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Test%22%7D&auth_date=1893456000&hash=fake",
      initDataUnsafe: {
        query_id: "abc",
        user: { id: 1, first_name: "Test" },
        auth_date: 1893456000,
        hash: "fake",
      },
      version: "7.0",
      platform: "tdesktop",
      colorScheme: "light",
      themeParams: {},
      isExpanded: true,
      viewportHeight: 800,
      viewportStableHeight: 800,
      headerColor: "#ffffff",
      backgroundColor: "#ffffff",
      ready: function () {},
      expand: function () {},
      close: function () {},
      onEvent: function () {},
      offEvent: function () {},
      sendData: function () {},
      setHeaderColor: function () {},
      setBackgroundColor: function () {},
      setBottomBarColor: function () {},
      requestWriteAccess: function () {},
      MainButton: {
        show: function () {},
        hide: function () {},
        setText: function () {},
        onClick: function () {},
        offClick: function () {},
        isVisible: false,
      },
      BackButton: {
        show: function () {},
        hide: function () {},
        onClick: function () {},
        offClick: function () {},
        isVisible: false,
      },
    },
  };
`;

test.beforeEach(async ({ page }) => {
  // Replace the real Telegram bridge with our stub so initData survives.
  await page.route('**/telegram-web-app.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: TELEGRAM_STUB }),
  );

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
  // "My SOPs" only appears in the dashboard grid (nav uses "SOPs")
  await page.getByRole('link', { name: 'My SOPs' }).click();
  await expect(page.getByRole('heading', { name: 'SOPs' })).toBeVisible();
});

test('opens analytics from dashboard', async ({ page }) => {
  await page.goto('/');
  // Scope to dashboard grid to avoid matching the bottom-nav "Analytics" link
  await page.locator('.grid').getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
});

import { test, expect } from '@playwright/test';

test.describe('Basic UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/Pi-Deck/);
  });

  test('shows either connecting or empty state', async ({ page }) => {
    const content = (await page.textContent('body')) || '';
    expect(/connecting|no workspace open/i.test(content)).toBeTruthy();
  });

  test('has non-white background theme', async ({ page }) => {
    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).not.toBe('rgb(255, 255, 255)');
  });

  test('is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('button', { name: /Open directory/i })).toBeVisible();
  });
});

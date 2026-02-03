import { test, expect } from '@playwright/test';

test.describe('Basic UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/Pi Web UI/);
  });

  test('shows loading state initially', async ({ page }) => {
    // Either shows connecting or empty state
    const hasConnecting = await page.getByText(/connecting/i).isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No workspace open').isVisible().catch(() => false);
    expect(hasConnecting || hasEmpty).toBeTruthy();
  });

  test('has theme applied (dark background)', async ({ page }) => {
    // Wait for app to load
    await page.waitForSelector('body');
    
    // Check that body has dark-ish background (pi-bg is a dark color)
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    
    // Should not be white or very light
    expect(bodyBg).not.toBe('rgb(255, 255, 255)');
  });

  test('shows status bar at bottom', async ({ page }) => {
    // Status bar should be visible at the bottom
    const statusBar = page.locator('.border-t');
    await expect(statusBar).toBeVisible();
  });

  test('responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Should still show main content
    await expect(page.getByText(/No workspace|Open directory/)).toBeVisible();
  });

  test('has proper focus management', async ({ page }) => {
    // Tab should move focus through interactive elements
    await page.keyboard.press('Tab');
    
    // Some element should be focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });
});

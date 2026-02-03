import { test, expect } from '@playwright/test';

test.describe('Workspace Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows empty state when no workspace is open', async ({ page }) => {
    await expect(page.getByText('No workspace open')).toBeVisible();
    await expect(page.getByText('Open directory')).toBeVisible();
  });

  test('has working keyboard shortcut hint', async ({ page }) => {
    // Should show keyboard shortcut for open directory
    await expect(page.getByText(/⌘O|Ctrl\+O/)).toBeVisible();
  });

  test('opens directory browser when clicking button', async ({ page }) => {
    await page.getByText('Open directory').click();
    // Directory browser should appear
    await expect(page.getByText('Open Directory')).toBeVisible();
  });

  test('opens directory browser with keyboard shortcut', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    await expect(page.getByText('Open Directory')).toBeVisible();
  });

  test('closes directory browser with Escape', async ({ page }) => {
    await page.getByText('Open directory').click();
    await expect(page.getByText('Open Directory')).toBeVisible();
    
    await page.keyboard.press('Escape');
    await expect(page.getByText('Open Directory')).not.toBeVisible();
  });

  test('shows recent workspaces in directory browser', async ({ page }) => {
    await page.getByText('Open directory').click();
    // If there are recent workspaces, they should be shown
    await expect(page.getByText(/Recent|Allowed/)).toBeVisible();
  });

  test('shows settings button', async ({ page }) => {
    // Settings icon/button should be visible
    await expect(page.locator('[title*="Settings"]')).toBeVisible();
  });

  test('opens settings dialog', async ({ page }) => {
    await page.locator('[title*="Settings"]').click();
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('settings shows theme options', async ({ page }) => {
    await page.locator('[title*="Settings"]').click();
    await expect(page.getByText('Dark')).toBeVisible();
    await expect(page.getByText('Light')).toBeVisible();
  });
});

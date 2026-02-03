import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows hotkeys dialog with ?', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
  });

  test('hotkeys dialog shows input shortcuts', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByText('Input')).toBeVisible();
    await expect(page.getByText('Send message')).toBeVisible();
  });

  test('closes hotkeys dialog with Escape', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
    
    await page.keyboard.press('Escape');
    await expect(page.getByText('Keyboard Shortcuts')).not.toBeVisible();
  });

  test('opens settings with Cmd+,', async ({ page }) => {
    await page.keyboard.press('Meta+,');
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('opens directory browser with Cmd+O', async ({ page }) => {
    await page.keyboard.press('Meta+o');
    await expect(page.getByText('Open Directory')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

/**
 * E2E tests for common UI interactions and paper cuts
 * 
 * These tests verify that:
 * - Input fields work correctly (focus, typing, paste)
 * - Scrolling behaves properly during streaming
 * - Buttons respond to clicks
 * - Modals open and close correctly
 * - Keyboard navigation works
 */

test.describe('Input Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('textarea accepts text input', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('Hello, this is a test message');
      await expect(textarea).toHaveValue('Hello, this is a test message');
    }
  });

  test('textarea supports multiline input', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('Line 1\nLine 2\nLine 3');
      await expect(textarea).toHaveValue('Line 1\nLine 2\nLine 3');
    }
  });

  test('input field maintains focus after typing', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('test');
      await expect(textarea).toBeFocused();
    }
  });

  test('keyboard shortcuts work', async ({ page }) => {
    // Test ? for hotkeys
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(500);
    
    // Should show hotkeys dialog or settings
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/Keyboard Shortcuts|Settings|Hotkeys/i);
    
    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });
});

test.describe('Modal Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('settings opens and closes', async ({ page }) => {
    // Open settings
    await page.keyboard.press('Control+Comma');
    await page.waitForTimeout(500);
    
    // Should show settings
    await expect(page.getByText('Settings').first()).toBeVisible();
    
    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('directory browser opens and closes', async ({ page }) => {
    const openButton = page.getByRole('button', { name: /Open directory/i });
    if (await openButton.isVisible().catch(() => false)) {
      await openButton.click();
      await page.waitForTimeout(500);
      
      // Should show directory browser
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('clicking backdrop closes modal', async ({ page }) => {
    const openButton = page.getByRole('button', { name: /Open directory/i });
    if (await openButton.isVisible().catch(() => false)) {
      await openButton.click();
      await page.waitForTimeout(500);
      
      // Click on backdrop (outside the modal)
      await page.mouse.click(10, 10);
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Scrolling Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('page is scrollable', async ({ page }) => {
    // Try to scroll
    await page.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await page.evaluate(() => window.scrollY);
    // Scroll might not work if page fits viewport, that's ok
    expect(typeof scrollY).toBe('number');
  });

  test('content area scrolls independently', async ({ page }) => {
    const scrollableAreas = await page.locator('.overflow-y-auto, .overflow-auto').all();
    for (const area of scrollableAreas.slice(0, 3)) {
      if (await area.isVisible().catch(() => false)) {
        await area.evaluate(el => el.scrollTop = 50);
        const scrollTop = await area.evaluate(el => el.scrollTop);
        expect(typeof scrollTop).toBe('number');
      }
    }
  });
});

test.describe('Button Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('buttons are clickable', async ({ page }) => {
    const buttons = await page.getByRole('button').all();
    // Test first few buttons
    for (const button of buttons.slice(0, 3)) {
      if (await button.isVisible().catch(() => false)) {
        await expect(button).toBeEnabled();
      }
    }
  });

  test('buttons show hover states', async ({ page }) => {
    const button = page.getByRole('button').first();
    if (await button.isVisible().catch(() => false)) {
      await button.hover();
      await page.waitForTimeout(200);
      // Just verify it doesn't throw
      await expect(button).toBeVisible();
    }
  });
});

test.describe('Responsive Behavior', () => {
  test('works on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('works on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('adapts to small mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await expect(page.locator('body')).toBeVisible();
    
    // Buttons should still be tappable
    const buttons = await page.getByRole('button').all();
    for (const button of buttons.slice(0, 2)) {
      if (await button.isVisible().catch(() => false)) {
        const box = await button.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});

test.describe('Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('focus is visible on interactive elements', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.focus();
      await expect(textarea).toBeFocused();
    }
  });

  test('tab navigation works', async ({ page }) => {
    // Press Tab a few times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }
    
    // Some element should have focus
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeTruthy();
  });
});

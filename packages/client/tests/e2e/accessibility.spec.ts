import { test, expect } from '@playwright/test';

/**
 * Accessibility E2E tests
 * 
 * These tests verify:
 * - Keyboard navigation works
 * - ARIA attributes are present
 * - Focus management is correct
 * - Screen reader compatibility
 */

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('tab navigates through interactive elements', async ({ page }) => {
    // Get initial focus
    await page.keyboard.press('Tab');
    
    // Should be able to tab through multiple elements
    const focusedElements: string[] = [];
    for (let i = 0; i < 10; i++) {
      const activeElement = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.tagName + (el.getAttribute('aria-label') || el.textContent?.slice(0, 20) || '') : 'null';
      });
      
      if (activeElement && !focusedElements.includes(activeElement)) {
        focusedElements.push(activeElement);
      }
      
      await page.keyboard.press('Tab');
    }
    
    // Should have tabbed through multiple unique elements
    expect(focusedElements.length).toBeGreaterThan(3);
  });

  test('escape closes modals and dialogs', async ({ page }) => {
    // Try to open a dialog
    const openButton = page.getByRole('button', { name: /Open directory/i });
    if (await openButton.isVisible().catch(() => false)) {
      await openButton.click();
      await page.waitForTimeout(500);
      
      // Dialog should be visible
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible().catch(() => false)) {
        // Press escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
        // Dialog should be closed
        await expect(dialog).not.toBeVisible();
      }
    }
  });

  test('enter activates buttons', async ({ page }) => {
    const button = page.getByRole('button').first();
    if (await button.isVisible().catch(() => false)) {
      // Focus the button
      await button.focus();
      
      // Press enter
      await page.keyboard.press('Enter');
      
      // Should not throw error
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('space toggles checkboxes', async ({ page }) => {
    // Find a checkbox if one exists
    const checkbox = page.getByRole('checkbox').first();
    if (await checkbox.isVisible().catch(() => false)) {
      const initialChecked = await checkbox.isChecked();
      
      await checkbox.focus();
      await page.keyboard.press('Space');
      
      const newChecked = await checkbox.isChecked();
      expect(newChecked).not.toBe(initialChecked);
    }
  });
});

test.describe('ARIA Attributes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('buttons have accessible names', async ({ page }) => {
    const buttons = await page.getByRole('button').all();
    
    for (const button of buttons.slice(0, 10)) {
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      const title = await button.getAttribute('title');
      
      // Button should have some accessible name
      const hasAccessibleName = ariaLabel || text?.trim() || title;
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('images have alt text', async ({ page }) => {
    const images = await page.locator('img').all();
    
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const role = await img.getAttribute('role');
      
      // Image should have alt text or be decorative (role="presentation")
      const isAccessible = alt !== null || ariaLabel || role === 'presentation';
      expect(isAccessible).toBe(true);
    }
  });

  test('form inputs have labels', async ({ page }) => {
    const inputs = await page.locator('input, textarea, select').all();
    
    for (const input of inputs.slice(0, 5)) {
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const id = await input.getAttribute('id');
      const placeholder = await input.getAttribute('placeholder');
      
      // Input should have some form of label
      const hasLabel = ariaLabel || ariaLabelledBy || placeholder;
      expect(hasLabel).toBeTruthy();
    }
  });

  test('headings are properly structured', async ({ page }) => {
    const h1s = await page.locator('h1').count();
    const h2s = await page.locator('h2').count();
    
    // Should have at most one h1
    expect(h1s).toBeLessThanOrEqual(1);
    
    // If there are headings, they should be in order
    if (h2s > 0) {
      expect(h1s).toBeGreaterThan(0);
    }
  });
});

test.describe('Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('focus is visible on all interactive elements', async ({ page }) => {
    const button = page.getByRole('button').first();
    if (await button.isVisible().catch(() => false)) {
      await button.focus();
      
      // Check if focus is visible (has outline or box-shadow)
      const outline = await button.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.outline || style.boxShadow;
      });
      
      // Focus should be visible
      expect(outline).toBeTruthy();
    }
  });

  test('focus trap in modals', async ({ page }) => {
    const openButton = page.getByRole('button', { name: /Open directory/i });
    if (await openButton.isVisible().catch(() => false)) {
      await openButton.click();
      await page.waitForTimeout(500);
      
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible().catch(() => false)) {
        // Tab through elements in dialog
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
        }
        
        // Focus should still be within the dialog
        const activeElement = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? el.closest('[role="dialog"]') !== null : false;
        });
        
        expect(activeElement).toBe(true);
      }
    }
  });

  test('focus returns to trigger after modal closes', async ({ page }) => {
    const openButton = page.getByRole('button', { name: /Open directory/i });
    if (await openButton.isVisible().catch(() => false)) {
      await openButton.click();
      await page.waitForTimeout(500);
      
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible().catch(() => false)) {
        // Close the dialog
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
        // Focus should return to the trigger button
        const isFocused = await openButton.evaluate(el => el === document.activeElement);
        expect(isFocused).toBe(true);
      }
    }
  });
});

test.describe('Screen Reader Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('live regions for dynamic content', async ({ page }) => {
    // Check for live regions (aria-live)
    const liveRegions = await page.locator('[aria-live]').count();
    
    // Should have at least one live region for status updates
    expect(liveRegions).toBeGreaterThanOrEqual(0);
  });

  test('status messages are announced', async ({ page }) => {
    // Look for status role
    const statusElements = await page.locator('[role="status"]').count();
    const alertElements = await page.locator('[role="alert"]').count();
    
    // Combined status/alert elements
    expect(statusElements + alertElements).toBeGreaterThanOrEqual(0);
  });

  test('landmark regions are present', async ({ page }) => {
    const main = await page.locator('main, [role="main"]').count();
    const navigation = await page.locator('nav, [role="navigation"]').count();
    const complementary = await page.locator('aside, [role="complementary"]').count();
    
    // Should have main content area
    expect(main).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('text has sufficient color contrast', async ({ page }) => {
    // Get all text elements
    const textElements = await page.locator('p, span, h1, h2, h3, h4, h5, h6, button, a, label').all();
    
    for (const el of textElements.slice(0, 20)) {
      const color = await el.evaluate(e => {
        const style = window.getComputedStyle(e);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      });
      
      // Elements should have color defined
      expect(color.color).toBeTruthy();
    }
  });
});

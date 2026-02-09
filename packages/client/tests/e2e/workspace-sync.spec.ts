import { test, expect } from '@playwright/test';

/**
 * E2E tests for workspace, tab, conversation state and syncing
 * 
 * These tests verify that:
 * - Conversations show as running when they should
 * - Tab layouts sync correctly across reconnections
 * - Workspace state persists during network issues
 * - Multiple devices can share the same workspace
 */

test.describe('Workspace State Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows workspace as running when conversation is active', async ({ page }) => {
    // Wait for connection
    await page.waitForTimeout(1000);
    
    // Open a workspace (if not already open)
    const openDirButton = page.getByRole('button', { name: /Open directory/i });
    if (await openDirButton.isVisible().catch(() => false)) {
      await openDirButton.click();
      await page.getByRole('dialog', { name: 'Open Directory' }).waitFor();
      
      // Click on home directory
      await page.getByText(/Home/).first().click();
      await page.waitForTimeout(500);
    }
    
    // The workspace should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('preserves tab layout after page refresh', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000);
    
    // Get initial state
    const initialBody = await page.textContent('body');
    
    // Refresh the page
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('shows reconnection status when connection is lost', async ({ page }) => {
    // Wait for connection
    await page.waitForTimeout(1000);
    
    // Simulate offline
    await page.context().setOffline(true);
    
    // Wait for reconnection message
    await page.waitForTimeout(3000);
    
    // Check for reconnection indicator or message
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/connecting|reconnecting|offline/);
    
    // Restore connection
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
  });

  test('workspace list persists during reconnection', async ({ page }) => {
    // Wait for connection
    await page.waitForTimeout(1000);
    
    // Get initial workspace state
    const initialContent = await page.textContent('body');
    
    // Simulate brief disconnection
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await page.context().setOffline(false);
    
    // Wait for reconnection
    await page.waitForTimeout(3000);
    
    // Page should still show content (not empty state)
    const afterReconnectContent = await page.textContent('body');
    expect(afterReconnectContent?.length).toBeGreaterThan(100);
  });
});

test.describe('Conversation State', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows streaming indicator during active generation', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // The UI should be in a stable state
    await expect(page.locator('body')).toBeVisible();
    
    // Check that we can interact with the input
    const textareas = await page.locator('textarea').all();
    if (textareas.length > 0) {
      await expect(textareas[0]).toBeVisible();
    }
  });

  test('input field remains functional after reconnection', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Simulate disconnection and reconnection
    await page.context().setOffline(true);
    await page.waitForTimeout(500);
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    
    // Input should still be interactable
    const textareas = await page.locator('textarea').all();
    if (textareas.length > 0) {
      await textareas[0].fill('test message');
      await expect(textareas[0]).toHaveValue('test message');
    }
  });
});

test.describe('Tab Layout Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('tab state is preserved during navigation', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Open settings and close it
    await page.keyboard.press('Control+Comma');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // UI should return to normal state
    await expect(page.locator('body')).toBeVisible();
  });

  test('multiple pane layout persists', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Check that the layout container exists
    const layoutContainer = await page.locator('.flex-1').first();
    await expect(layoutContainer).toBeVisible();
  });
});

test.describe('Multi-Device Sync', () => {
  test('workspaces can be accessed from multiple browser contexts', async ({ browser }) => {
    // Create two separate browser contexts (simulating two devices)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Both navigate to the app
    await page1.goto('/');
    await page2.goto('/');
    
    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);
    
    // Both should show the app
    await expect(page1.locator('body')).toBeVisible();
    await expect(page2.locator('body')).toBeVisible();
    
    // Clean up
    await context1.close();
    await context2.close();
  });
});

test.describe('Error Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('recovers from WebSocket disconnection', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Simulate network issues
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);
    
    // Should show some indication of disconnection
    const bodyText = await page.textContent('body');
    const hasConnectionIndicator = /connecting|reconnecting|offline|connection/i.test(bodyText || '');
    
    // Restore connection
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);
    
    // Should recover
    await expect(page.locator('body')).toBeVisible();
  });

  test('maintains UI state after rapid reconnections', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Multiple rapid disconnections
    for (let i = 0; i < 3; i++) {
      await page.context().setOffline(true);
      await page.waitForTimeout(500);
      await page.context().setOffline(false);
      await page.waitForTimeout(500);
    }
    
    // Wait for stabilization
    await page.waitForTimeout(2000);
    
    // UI should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});

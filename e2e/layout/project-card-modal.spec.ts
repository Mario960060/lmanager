import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../.auth/user.json');

test.describe('ProjectCardModal - status buttons layout', () => {
  test.use({
    storageState: process.env.E2E_TEST_EMAIL ? authFile : undefined,
  });

  test('status buttons are in one row on mobile', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required - set E2E_TEST_EMAIL and E2E_TEST_PASSWORD');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/project-management/create-canvas');
    await page.waitForLoadState('networkidle');

    const statusButtons = page.locator('[data-testid="status-buttons"]');
    await expect(statusButtons).toBeVisible({ timeout: 15000 });

    const planned = page.locator('[data-testid="status-planned"]');
    const scheduled = page.locator('[data-testid="status-scheduled"]');
    const inProgress = page.locator('[data-testid="status-in_progress"]');

    await expect(planned).toBeVisible();
    await expect(scheduled).toBeVisible();
    await expect(inProgress).toBeVisible();

    const boxes = await statusButtons.locator('button').allBoundingBoxes();
    if (boxes && boxes.length >= 2) {
      const firstY = boxes[0]!.y;
      for (let i = 1; i < boxes.length; i++) {
        expect(Math.abs(boxes[i]!.y - firstY)).toBeLessThan(10);
      }
    }
  });

  test('ProjectCardModal opens with status buttons', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/project-management/create-canvas');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('[data-testid="project-card-modal"]');
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="status-buttons"]')).toBeVisible();
  });
});

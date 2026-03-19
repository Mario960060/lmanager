import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../.auth/user.json');

test.describe('Projects page - card layout', () => {
  test.use({
    storageState: process.env.E2E_TEST_EMAIL ? authFile : undefined,
  });

  test('project cards have consistent structure on desktop', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const cards = page.locator('[data-testid="project-card"]');
    const count = await cards.count();
    if (count === 0) return;

    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    const box = await firstCard.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(180);
  });

  test('project cards stats row at bottom - multiple cards align', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const cards = page.locator('[data-testid="project-card"]');
    const count = await cards.count();
    if (count < 2) return;

    const boxes = await cards.allBoundingBoxes();
    const heights = boxes!.map((b) => b!.height);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    expect(maxH - minH).toBeLessThan(80);
  });
});

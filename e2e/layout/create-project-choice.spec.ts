import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../.auth/user.json');

test.describe('Create Project Choice Modal - layout', () => {
  test.use({
    storageState: process.env.E2E_TEST_EMAIL ? authFile : undefined,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/project-management');
    await page.waitForLoadState('networkidle');
    const createBtn = page.getByRole('button', { name: /create project|utwórz projekt|create_project_button/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
    }
  });

  test('shows create project choice cards on desktop', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required - set E2E_TEST_EMAIL and E2E_TEST_PASSWORD');
    await page.setViewportSize({ width: 1280, height: 720 });

    const cards = page.locator('[data-testid="create-project-choice-cards"]');
    await expect(cards).toBeVisible({ timeout: 5000 });

    const formCard = page.locator('[data-testid="create-choice-form-based"]');
    const canvasCard = page.locator('[data-testid="create-choice-canvas"]');
    await expect(formCard).toBeVisible();
    await expect(canvasCard).toBeVisible();

    const formBox = await formCard.boundingBox();
    const canvasBox = await canvasCard.boundingBox();
    expect(formBox?.height).toBeGreaterThanOrEqual(100);
    expect(canvasBox?.height).toBeGreaterThanOrEqual(100);
  });

  test('both choice cards have same min height on desktop', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required');
    await page.setViewportSize({ width: 1280, height: 720 });

    const formCard = page.locator('[data-testid="create-choice-form-based"]');
    const canvasCard = page.locator('[data-testid="create-choice-canvas"]');
    await expect(formCard).toBeVisible({ timeout: 5000 });

    const formBox = await formCard.boundingBox();
    const canvasBox = await canvasCard.boundingBox();
    if (formBox && canvasBox) {
      expect(Math.abs(formBox.height - canvasBox.height)).toBeLessThan(50);
    }
  });

  test('choice cards visible on mobile', async ({ page }) => {
    test.skip(!process.env.E2E_TEST_EMAIL, 'Auth required');
    await page.setViewportSize({ width: 375, height: 667 });

    const formCard = page.locator('[data-testid="create-choice-form-based"]');
    const canvasCard = page.locator('[data-testid="create-choice-canvas"]');
    await expect(formCard).toBeVisible({ timeout: 5000 });
    await expect(canvasCard).toBeVisible();
  });
});

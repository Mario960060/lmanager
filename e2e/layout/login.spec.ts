import { test, expect } from '@playwright/test';

test.describe('Login page layout', () => {
  test('loads and shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|zaloguj/i })).toBeVisible();
  });

  test('mobile viewport - form elements are visible and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    const emailBox = await emailInput.boundingBox();
    const passwordBox = await passwordInput.boundingBox();
    expect(emailBox?.width).toBeGreaterThan(200);
    expect(passwordBox?.width).toBeGreaterThan(200);
  });
});

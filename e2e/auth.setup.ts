/**
 * Auth setup for E2E tests.
 * Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in .env to enable auth-required tests.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env.local') });

import { test as setup } from '@playwright/test';
const authDir = path.join(__dirname, '../.auth');
const authFile = path.join(authDir, 'user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  fs.mkdirSync(authDir, { recursive: true });
  const emptyState = { cookies: [], origins: [] };
  fs.writeFileSync(authFile, JSON.stringify(emptyState, null, 2));

  if (!email || !password) {
    console.warn('E2E_TEST_EMAIL and E2E_TEST_PASSWORD not set - auth-required tests will be skipped');
    return;
  }

  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  const navigated = await page.waitForURL(/\/(?!login)/, { timeout: 20000 }).catch(() => false);
  if (!navigated) {
    const errorEl = page.locator('[role="alert"], .text-red-500, [style*="color: rgb(239, 68, 68)"]');
    const errorText = await errorEl.first().textContent().catch(() => '');
    console.warn('Login may have failed. Current URL:', page.url(), 'Error:', errorText || 'none');
  }
  await page.context().storageState({ path: authFile });
});

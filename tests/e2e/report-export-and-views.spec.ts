import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mediaplan-store-v2'))
      localStorage.setItem('mediaplan-store-v2', JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 }));
  });
});
test('report PDF export downloads', async ({ page }) => {
  await page.goto('/report');
  const btn = page.getByRole('button', { name: /Export PDF/ });
  await expect(btn).toBeEnabled({ timeout: 20000 });
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await btn.click();
  const d = await dl;
  console.log('DOWNLOAD', d.suggestedFilename());
  expect(d.suggestedFilename()).toMatch(/\.pdf$/);
});
test('dashboard shows new tabs', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByText('Multi-Month Charts').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Scenario Comparison').first()).toBeVisible();
});

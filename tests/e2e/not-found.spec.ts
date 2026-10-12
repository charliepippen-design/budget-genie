import { expect, test } from '@playwright/test';

test.describe('branded 404', () => {
  test('unknown route shows the 404 page and links home', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByText('/this-does-not-exist')).toBeVisible();

    await page.getByRole('link', { name: 'Go to homepage' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
  });

  test('/refund redirects to /refund-policy', async ({ page }) => {
    await page.goto('/refund');
    await expect(page).toHaveURL(/\/refund-policy$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
  });

  for (const path of ['/dashboard', '/planner', '/demo']) {
    test(`${path} redirects to the app instead of a 404`, async ({ page }) => {
      await page.addInitScript(() => {
        if (!localStorage.getItem('mediaplan-store-v2'))
          localStorage.setItem('mediaplan-store-v2', JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 }));
      });
      await page.goto(path);
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
    });
  }
});

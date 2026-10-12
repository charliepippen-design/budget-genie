import { expect, test } from '@playwright/test';

// Runs against the MOCK_CLERK dev server: the auth page must render for every Clerk sub-path.
for (const path of ['/auth', '/auth/factor-one', '/auth/sso-callback', '/sign-up', '/sign-up/verify-email-address']) {
  test(`${path} renders the auth page, not NotFound`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-qa="mock-sign-in"]')).toBeVisible();
  });
}

test('landing CTA sends a signed-in free user to the app, not /pricing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('qa-mock-user', 'free');
    localStorage.setItem(
      'mediaplan-store-v2',
      JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 })
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Enter/ }).first().click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
});

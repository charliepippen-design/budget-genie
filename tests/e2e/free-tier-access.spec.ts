import { expect, test } from '@playwright/test';

// MOCK_CLERK=1 dev server (see playwright.config.ts). 'qa-mock-user' = 'free' makes the mock a
// newly signed-up user with no paid plan (empty Clerk publicMetadata).
test.describe('free tier: new user without a paid plan', () => {
  test('a brand-new user opening /app is not sent to /pricing', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('qa-mock-user', 'free');
    });
    await page.goto('/app');
    // First visit goes through onboarding, never the paywall.
    await expect(page).toHaveURL(/\/(app|onboard)(\?|$)/, { timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).not.toBe('/pricing');
  });

  test('after onboarding the free user lands on the /app dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('qa-mock-user', 'free');
      if (!localStorage.getItem('mediaplan-store-v2')) {
        localStorage.setItem(
          'mediaplan-store-v2',
          JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 })
        );
      }
    });
    await page.goto('/app');
    await expect(page.getByText('Smart Strategies')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe('/app');
  });

  for (const route of ['/onboard', '/report', '/output', '/settings']) {
    test(`free user can open ${route} without a paywall redirect`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('qa-mock-user', 'free');
        localStorage.setItem(
          'mediaplan-store-v2',
          JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 })
        );
      });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      expect(new URL(page.url()).pathname).not.toBe('/pricing');
    });
  }
});

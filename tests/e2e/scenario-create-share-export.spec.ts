import { expect, test } from '@playwright/test';

// The dev server runs with MOCK_CLERK=1 (see playwright.config.ts), so /app is reachable
// as a signed-in superuser. First visit redirects to /onboard unless onboarding is complete,
// so seed the persisted store the same way the app does.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mediaplan-store-v2')) {
      localStorage.setItem(
        'mediaplan-store-v2',
        JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 })
      );
    }
  });
});

test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MediaPlanner Pro' })).toBeVisible({ timeout: 20_000 });
});

test('scenario create share export flow smoke', async ({ page }) => {
  await page.goto('/app');

  await expect(page.getByText('Smart Strategies')).toBeVisible({ timeout: 20_000 });

  await page.getByPlaceholder('e.g. 4.0').fill('2');

  await page.getByRole('button', { name: 'Optimize Scenario' }).click();
  // Outcome depends on the plan: either an optimized scenario or "no opportunities" toast.
  await expect(
    page.getByText(/Optimized Scenario Generated|No optimization opportunities found/).first()
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole('main').getByRole('button', { name: 'My Projects' }).click();
  await expect(page.getByText('Project Repository')).toBeVisible();
});

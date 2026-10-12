import { expect, test } from '@playwright/test';

// AI-1 regression: opening /report or /output must not call the AI gateway (each call is a free AI turn).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mediaplan-store-v2'))
      localStorage.setItem('mediaplan-store-v2', JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 9 }));
  });
});

for (const route of ['/report', '/output']) {
  test(`visiting ${route} makes no AI request`, async ({ page }) => {
    let aiCalls = 0;
    await page.route('**/api/ai-gateway', (r) => {
      aiCalls++;
      return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    });
    await page.goto(route);
    await expect(page.getByText('Back to Plan').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);
    expect(aiCalls).toBe(0);
  });
}

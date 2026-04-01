import { expect, test } from '@playwright/test';

test('scenario create share export flow smoke', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Smart Strategies')).toBeVisible();

  await page.getByPlaceholder('e.g. 4.0').fill('2');

  await page.getByRole('button', { name: 'Optimize Scenario' }).click();
  await expect(page.getByText('Optimized Scenario Generated')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('main').getByRole('button', { name: 'My Projects' }).click();
  await expect(page.getByText('Project Repository')).toBeVisible();
});

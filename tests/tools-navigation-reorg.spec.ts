import { expect, test } from '@playwright/test';

const canonicalTools = [
  ['Pipe Offset', 'pipe-offset'],
  ['Mitered Elbow', 'mitered-elbow'],
  ['Pipe Comb', 'pipe-comb'],
  ['Two-elbow offset', 'two-elbow-offset'],
] as const;

test.describe('PB-TOOLS-NAV-REORG-001', () => {
  test('groups the catalog and keeps canonical deep links', async ({ page }) => {
    await page.goto('/tools');
    const beta = page.getByRole('button', { name: 'Continue' });
    if (await beta.count()) await beta.click();

    await expect(page.locator('[data-testid^="tools-section-"]')).toHaveCount(7);
    for (const [label] of canonicalTools) {
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    }

    for (const [label, key] of canonicalTools) {
      await page.goto('/tools');
      const continueButton = page.getByRole('button', { name: 'Continue' });
      if (await continueButton.count()) await continueButton.click();
      await page.getByRole('heading', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]t=${key}$`));
    }
  });

  test('mounts without an empty screen on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tools');
    const beta = page.getByRole('button', { name: 'Continue' });
    if (await beta.count()) await beta.click();
    await expect(page.locator('body')).toContainText('Engineering calculators & utilities');
    await expect(page.locator('h3').first()).toBeVisible();
  });
});

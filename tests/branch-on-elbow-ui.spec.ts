import { expect, test } from '@playwright/test';

const TOOL_URL = '/tools?t=branch-layout&lng=en';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(TOOL_URL);
  /* The modal mounts after hydration, so it is not there when goto() resolves. isVisible()
     never waits (its timeout option is ignored), hence waitFor: otherwise the overlay is
     still intercepting pointer events when the first family click happens. */
  const betaDialog = page.getByRole('dialog', { name: 'Beta Version' });
  const shown = await betaDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (shown) {
    await betaDialog.getByRole('button', { name: 'Continue' }).click();
    await betaDialog.waitFor({ state: 'hidden' });
  }
}

async function selectElbow(page: import('@playwright/test').Page) {
  await openTool(page);
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Tube → elbow' }).click();
  await expect(page.getByRole('button', { name: 'Tube → elbow' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('elbow-results')).toBeVisible();
}

const CASES = [
  { datum: 'EJE · axis', x: '0 mm', y: '334.82 mm', cut: '183.647 mm' },
  { datum: 'BOP · bottom', x: '-41.34 mm', y: '318.7 mm', cut: '196.49 mm' },
  { datum: 'TOP · top', x: '41.34 mm', y: '318.7 mm', cut: '196.49 mm' },
  { datum: 'COTA Fe', x: '20.19 mm', y: '330.92 mm', cut: '186.734 mm' },
] as const;

function metric(page: import('@playwright/test').Page, label: string) {
  return page.getByTestId('elbow-results').getByText(label, { exact: true }).locator('..');
}

test('straight header stays default and retains its values and PDF actions', async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Saddle Cut Template (Flat Pattern)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print picaje template 1:1' })).toBeVisible();
  await page.getByRole('button', { name: 'Tube → elbow' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toHaveCount(0);
  await expect(page.getByTestId('elbow-results')).toBeVisible();
  await page.getByRole('button', { name: 'Tube → tube / header' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
});

test('four datums reproduce numeric results, FE visibility and direct station mapping', async ({ page }) => {
  await selectElbow(page);
  await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveCount(0);
  await expect(page.getByText('OD: 88.9 mm')).toBeVisible();
  await expect(page.getByText('ID: 77.92 mm')).toBeVisible();
  await expect(page.getByLabel('Elbow centreline radius R (mm)')).toHaveValue('228.6');
  await expect(page.getByLabel('Branch free length L (mm)')).toHaveValue('200');
  await expect(page.getByLabel('Axis height a (mm)')).toHaveValue('150');
  await expect(page.getByLabel('Marking divisions around branch circumference')).toHaveValue('24');
  for (const entry of CASES) {
    await page.getByRole('button', { name: entry.datum }).click();
    if (entry.datum === 'COTA Fe') {
      await expect(page.getByLabel('Signed offset Fe (mm)')).toBeVisible();
      await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveValue('20');
    } else {
      await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveCount(0);
    }
    await expect(metric(page, 'Cota X′')).toContainText(entry.x);
    await expect(metric(page, 'Cota Y′')).toContainText(entry.y);
    await expect(metric(page, 'Station spacing · Div')).toContainText('11.64 mm');
    const first = page.getByTestId('elbow-physical-station').first();
    await expect(first).toContainText('P1');
    await expect(first).toContainText(entry.cut);
    await expect(page.getByTestId('elbow-physical-station')).toHaveCount(24);
    await expect(page.getByTestId('elbow-closure')).toHaveCount(1);
    await expect(page.getByTestId('elbow-closure')).toContainText('360° closure = P1');
  }
  await page.getByLabel('Signed offset Fe (mm)').fill('-20');
  await expect(metric(page, 'Cota X′')).toContainText('-20.19 mm');
  await expect(metric(page, 'Cota Y′')).toContainText('330.92 mm');
});

test('invalid geometry and empty FE show an explicit error, never fabricated results', async ({ page }) => {
  await selectElbow(page);
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.getByLabel('Signed offset Fe (mm)').fill('85');
  await expect(page.locator('[data-geometry-error-code="OFFSET_OUT_OF_RANGE"]')).toBeVisible();
  await expect(page.getByTestId('elbow-results')).toHaveCount(0);
  await page.getByLabel('Signed offset Fe (mm)').fill('');
  await expect(page.locator('[data-geometry-error-code="NON_FINITE_INPUT"]')).toBeVisible();
  await page.getByRole('button', { name: 'EJE · axis' }).click();
  await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveCount(0);
  await expect(page.getByTestId('elbow-results')).toBeVisible();
  await page.getByLabel('Axis height a (mm)').fill('400');
  await expect(page.locator('[data-geometry-error-code="NO_INTERSECTION"]')).toBeVisible();
  await expect(page.getByTestId('elbow-results')).toHaveCount(0);
  await page.getByLabel('Elbow centreline radius R (mm)').fill('-1');
  await expect(page.locator('[data-geometry-error-code="NON_POSITIVE_DIMENSION"]')).toBeVisible();
});

test('mobile shows 24 readable station cards and one closure without desktop table', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await selectElbow(page);
  await expect(page.getByTestId('elbow-physical-station')).toHaveCount(24);
  await expect(page.getByTestId('elbow-closure')).toHaveCount(1);
  await expect(page.getByTestId('elbow-results').locator('table')).toBeHidden();
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await expect(page.getByLabel('Signed offset Fe (mm)')).toBeVisible();
  await expect(metric(page, 'Cota X′')).toContainText('20.19 mm');
});

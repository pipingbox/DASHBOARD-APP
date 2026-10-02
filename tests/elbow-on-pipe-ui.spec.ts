import { expect, test } from '@playwright/test';

/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.2a
 * CODO → TUBO panel, numeric results only.
 *
 * Expected numbers are not hand written: they come from the U5.1 kernel through
 * `projectElbowOnPipe`, and `scripts/test-elbow-on-pipe-display.ts` pins that
 * projection against the Tubero reference corpus (1769 checks). If a number here
 * ever disagrees with the panel, one of the two layers moved.
 */

const TOOL_URL = '/tools?t=branch-layout&lng=en';
const FAMILY = 'Elbow → tube';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(TOOL_URL);
  const betaDialog = page.getByRole('dialog', { name: 'Beta Version' });
  if (await betaDialog.isVisible()) await betaDialog.getByRole('button', { name: 'Continue' }).click();
}

async function selectElbowOnPipe(page: import('@playwright/test').Page) {
  await openTool(page);
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: FAMILY, exact: true }).click();
  await expect(page.getByRole('button', { name: FAMILY, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('elbow-on-pipe-results')).toBeVisible();
}

function metric(page: import('@playwright/test').Page, key: string) {
  return page.locator(`[data-testid="elbow-on-pipe-metric"][data-metric="${key}"]`);
}

/** Default case = REF-01 of the validated corpus: 3" Sch40 elbow, R 114.3, 6" receiver, N 24. */
const CASES = [
  { datum: 'EJE · axis', cotaX: '0 mm', seating: '159.49 mm', clamped: 1, p7t: '48', p7y: '37.775' },
  { datum: 'BOP · bottom', cotaX: '41.34 mm', seating: '149.54 mm', clamped: 7, p7t: '90', p7y: '114.3' },
  { datum: 'TOP · top', cotaX: '-41.34 mm', seating: '149.54 mm', clamped: 7, p7t: '34.9', p7y: '20.552' },
  { datum: 'COTA Fe', cotaX: '-20.19 mm', seating: '157.08 mm', clamped: 4, p7t: '41.1', p7y: '28.128' },
] as const;

test('the third family appears without disturbing the default straight header', async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: FAMILY, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();

  await page.getByRole('button', { name: FAMILY, exact: true }).click();
  await expect(page.getByTestId('elbow-on-pipe-results')).toBeVisible();
  await expect(page.getByText('Elbow-to-tube intersection · numeric results')).toBeVisible();
  /* U5.2a ships no physical output: no 1:1 button may appear in this family. */
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print picaje template 1:1' })).toHaveCount(0);
  await expect(page.getByTestId('elbow-results')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tube → tube / header' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);
});

test('four datums reproduce the corpus numbers, FE visibility and physical station order', async ({ page }) => {
  await selectElbowOnPipe(page);
  await expect(page.getByLabel('Signed Fe (mm)')).toHaveCount(0);
  await expect(page.getByText('OD: 88.9 mm')).toBeVisible();
  await expect(page.getByText('ID: 77.92 mm')).toBeVisible();
  await expect(page.getByText('Receiver OD · D: 168.3 mm')).toBeVisible();
  await expect(page.getByLabel('Elbow centreline radius R (mm)')).toHaveValue('114.3');
  await expect(page.getByLabel('Marking divisions around branch circumference')).toHaveValue('24');

  for (const entry of CASES) {
    await page.getByRole('button', { name: entry.datum }).click();
    if (entry.datum === 'COTA Fe') {
      await expect(page.getByLabel('Signed Fe (mm)')).toBeVisible();
      await expect(page.getByLabel('Signed Fe (mm)')).toHaveValue('20');
    } else {
      await expect(page.getByLabel('Signed Fe (mm)')).toHaveCount(0);
    }

    await expect(metric(page, 'cotaX')).toContainText(entry.cotaX);
    await expect(metric(page, 'seatingHeight')).toContainText(entry.seating);
    await expect(metric(page, 'div')).toContainText('11.64 mm');
    await expect(metric(page, 'circumference')).toContainText('279.288 mm');
    /* Cota Y' is blank by default, so no external card may exist yet. */
    await expect(metric(page, 'cotaY')).toHaveCount(0);

    const rows = page.getByTestId('elbow-on-pipe-row');
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText('P1');
    await expect(rows.nth(24)).toContainText('360° closure = P1');

    /* Station 6 is P7 in shop numbering and moves with the datum, unlike station
       0 which sits on the bend plane and is datum invariant. */
    const p7 = rows.nth(6);
    await expect(p7).toContainText('P7');
    await expect(p7).toContainText(entry.p7y);
    await expect(p7).toContainText(entry.p7t);

    await expect(page.getByTestId('elbow-on-pipe-clamp-note'))
      .toHaveAttribute('data-clamped-count', String(entry.clamped));
    await expect(page.locator('[data-testid="elbow-on-pipe-row"][data-clamped="true"]'))
      .toHaveCount(entry.clamped);
  }

  /* The sign convention of this family is the opposite of tubo→codo and must be
     stated on screen, not silently harmonised. */
  await expect(page.getByTestId('elbow-on-pipe-convention'))
    .toContainText('Positive Fe moves toward TOP');
  await page.getByLabel('Signed Fe (mm)').fill('-20');
  await expect(metric(page, 'cotaX')).toContainText('20.19 mm');
});

test("Cota Y' is external: identical geometry with and without it", async ({ page }) => {
  await selectElbowOnPipe(page);

  const rows = page.getByTestId('elbow-on-pipe-row');
  const kernelMetrics = page.locator('[data-testid="elbow-on-pipe-metric"][data-external="false"]');

  await expect(rows).toHaveCount(25);
  const rowsBefore = await rows.allInnerTexts();
  const metricsBefore = await kernelMetrics.allInnerTexts();
  const clampBefore = await page.getByTestId('elbow-on-pipe-clamp-note').getAttribute('data-clamped-count');
  await expect(metric(page, 'cotaY')).toHaveCount(0);

  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('100');
  await expect(metric(page, 'cotaY')).toBeVisible();
  await expect(metric(page, 'cotaY')).toContainText('100 mm');
  await expect(metric(page, 'cotaY')).toHaveAttribute('data-external', 'true');

  /* Every kernel driven cell must be byte identical: this is the REF-07 / REF-08
     controlled pair reproduced in the browser. */
  const rowsAfter = await rows.allInnerTexts();
  const metricsAfter = await kernelMetrics.allInnerTexts();
  expect(rowsAfter).toEqual(rowsBefore);
  expect(metricsAfter).toEqual(metricsBefore);
  expect(await page.getByTestId('elbow-on-pipe-clamp-note').getAttribute('data-clamped-count'))
    .toBe(clampBefore);
  await expect(kernelMetrics).toHaveCount(4);

  /* Clearing Y' removes only the external card. */
  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('');
  await expect(metric(page, 'cotaY')).toHaveCount(0);
  expect(await rows.allInnerTexts()).toEqual(rowsBefore);

  /* A negative Y' is a legitimate drawing dimension and still inert. */
  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('-42.5');
  await expect(metric(page, 'cotaY')).toContainText('-42.5 mm');
  expect(await rows.allInnerTexts()).toEqual(rowsBefore);
  expect(await kernelMetrics.allInnerTexts()).toEqual(metricsBefore);
});

test('invalid geometry shows an explicit code and never fabricated results', async ({ page }) => {
  await selectElbowOnPipe(page);

  /* A receiver smaller than the elbow cannot host it. */
  await page.getByLabel('NPS Size').nth(1).selectOption('2"');
  await expect(page.locator('[data-geometry-error-code="ELBOW_EXCEEDS_RECEIVER"]')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);
  await expect(page.getByTestId('elbow-on-pipe-row')).toHaveCount(0);
  await page.getByLabel('NPS Size').nth(1).selectOption('6"');
  await expect(page.getByTestId('elbow-on-pipe-results')).toBeVisible();

  /* A bend radius below half the elbow OD is not a manufacturable elbow. */
  await page.getByLabel('Elbow centreline radius R (mm)').fill('30');
  await expect(page.locator('[data-geometry-error-code="ELBOW_RADIUS_TOO_SMALL"]')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);
  await page.getByLabel('Elbow centreline radius R (mm)').fill('114.3');
  await expect(page.getByTestId('elbow-on-pipe-results')).toBeVisible();

  /* An Fe beyond the physical BOP–TOP range must be refused, not clamped. */
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.getByLabel('Signed Fe (mm)').fill('85');
  await expect(page.locator('[data-geometry-error-code="OFFSET_OUT_OF_RANGE"]')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);

  /* An empty Fe is missing data, not zero. */
  await page.getByLabel('Signed Fe (mm)').fill('');
  await expect(page.locator('[data-geometry-error-code="NON_FINITE_INPUT"]')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);

  /* An empty R is equally missing data. */
  await page.getByRole('button', { name: 'EJE · axis' }).click();
  await page.getByLabel('Elbow centreline radius R (mm)').fill('');
  await expect(page.locator('[data-geometry-error-code="NON_FINITE_INPUT"]')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);
});

test('divisions change the station count and keep a single closure', async ({ page }) => {
  await selectElbowOnPipe(page);
  for (const divisions of ['12', '36', '48']) {
    await page.getByLabel('Marking divisions around branch circumference').selectOption(divisions);
    await expect(page.getByTestId('elbow-on-pipe-row')).toHaveCount(Number(divisions) + 1);
    /* Scoped per layout: the closure exists once in the desktop table and once in
       the mobile card list, both present in the DOM at any viewport. */
    await expect(page.getByTestId('elbow-on-pipe-row')
      .filter({ hasText: '360° closure = P1' })).toHaveCount(1);
    await expect(page.getByTestId('elbow-on-pipe-closure')).toHaveCount(1);
    await expect(metric(page, 'circumference')).toContainText('279.288 mm');
  }
});

test('mobile cards stay readable at 375x812 and keep the clamp visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await selectElbowOnPipe(page);
  await page.getByRole('button', { name: 'BOP · bottom' }).click();

  await expect(page.getByTestId('elbow-on-pipe-physical-station')).toHaveCount(24);
  await expect(page.getByTestId('elbow-on-pipe-closure')).toHaveCount(1);

  const first = page.getByTestId('elbow-on-pipe-physical-station').first();
  await expect(first).toBeVisible();
  await expect(first).toContainText('P1');
  await expect(first).toContainText('158.75');

  /* The 90° plateau must be labelled on the small screen too. */
  const clamped = page.locator('[data-testid="elbow-on-pipe-physical-station"][data-clamped="true"]');
  await expect(clamped).toHaveCount(7);
  await expect(clamped.first()).toContainText('90° limit');
  await expect(page.getByTestId('elbow-on-pipe-clamp-note')).toBeVisible();
});

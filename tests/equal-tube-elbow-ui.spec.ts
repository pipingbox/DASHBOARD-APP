import { expect, test } from '@playwright/test';

/**
 * PB-BRANCH-EQUAL-TUBE-ELBOW-001 — U6.2
 * TUBO ⇄ CODO IGUALES panel, numeric results only.
 *
 * Expected numbers are not hand written: they come from the U6.1 kernel through
 * `projectEqualTubeElbow`, and `scripts/test-equal-tube-elbow-display.ts` pins
 * that projection against the Tubero reference corpus. The panel defaults are
 * REF-01 of that corpus: 3" Sch 40, R 114.3 (B16.9 long radius), L 300, N 24.
 */

const TOOL_URL = '/tools?t=branch-layout&lng=en';
const FAMILY = 'Tube ↔ elbow (equal)';

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

async function selectFamily(page: import('@playwright/test').Page) {
  await openTool(page);
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: FAMILY, exact: true }).click();
  await expect(page.getByRole('button', { name: FAMILY, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('equal-tube-elbow-results')).toBeVisible();
}

function metric(page: import('@playwright/test').Page, key: string) {
  return page.locator(`[data-testid="equal-tube-elbow-metric"][data-metric="${key}"]`);
}

test('the fourth family appears without disturbing the default straight header', async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: FAMILY, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();

  await page.getByRole('button', { name: FAMILY, exact: true }).click();
  await expect(page.getByTestId('equal-tube-elbow-results')).toBeVisible();
  await expect(page.getByText('Equal tube ↔ elbow joint')).toBeVisible();
  /* This family ships physical outputs of its own: tube template + elbow guide. */
  await expect(page.getByTestId('equal-tube-elbow-download-tube')).toBeVisible();
  await expect(page.getByTestId('equal-tube-elbow-download-guide')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);
  await expect(page.getByTestId('elbow-results')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tube → tube / header' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
  await expect(page.getByTestId('equal-tube-elbow-results')).toHaveCount(0);
});

test('the default case reproduces the REF-01 corpus numbers', async ({ page }) => {
  await selectFamily(page);
  await expect(page.getByText('OD: 88.9 mm')).toBeVisible();
  await expect(page.getByText('ID: 77.92 mm')).toBeVisible();
  await expect(page.getByLabel('Elbow centreline radius R (mm)')).toHaveValue('114.3');
  await expect(page.getByLabel('Tube length L (mm)')).toHaveValue('300');
  await expect(page.getByLabel('Marking divisions around branch circumference')).toHaveValue('24');

  /* Summary: every card is a kernel projection pinned by the display contract. */
  await expect(metric(page, 'length')).toContainText('300 mm');
  await expect(metric(page, 'radius')).toContainText('114.3 mm');
  await expect(metric(page, 'maxCutback')).toContainText('133.46 mm');
  await expect(metric(page, 'div')).toContainText('11.64 mm');
  await expect(metric(page, 'circumference')).toContainText('279.288 mm');

  /* Station table: 24 physical stations plus the 360° closure. */
  const rows = page.getByTestId('equal-tube-elbow-row');
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText('P1');
  await expect(rows.nth(24)).toContainText('360° closure = P1');

  /* P7 (station index 6) is the deepest generatrix of the bend plane side. */
  const p7 = rows.nth(6);
  await expect(p7).toContainText('P7');
  await expect(p7).toContainText('166.536');
  await expect(p7).toContainText('133.464');
  await expect(p7).toContainText('158.75');
  await expect(p7).toContainText('81.583');

  /* The 90° plateau: 13 of 24 stations terminate on the elbow end face.
     The closure row repeats P1 (itself clamped), hence 14 tagged rows. */
  await expect(page.getByTestId('equal-tube-elbow-clamp-note')).toHaveAttribute('data-clamped-count', '13');
  await expect(page.locator('[data-testid="equal-tube-elbow-row"][data-clamped="true"]')).toHaveCount(14);

  /* Fabrication block echoes the wrap circumference and page tiling:
     A4 portrait tiling of a 133.5 mm deep cut needs two pages in Y. */
  await expect(page.getByTestId('equal-tube-elbow-template-pages')).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('equal-tube-elbow-template-pages')).toHaveAttribute('data-pages-x', '1');
  await expect(page.getByTestId('equal-tube-elbow-template-pages')).toHaveAttribute('data-pages-y', '2');
  await expect(page.getByTestId('equal-tube-elbow-template-pages')).toHaveAttribute('data-circumference-mm', /^279\.287/);
  await expect(page.getByTestId('equal-tube-elbow-guide-pages')).toHaveAttribute('data-strip-length-mm', /^279\.287/);
});

test('NPS change adopts the B16.9 long radius of the new size', async ({ page }) => {
  await selectFamily(page);
  await page.getByLabel('NPS Size').selectOption('6"');
  await expect(page.getByText('OD: 168.3 mm')).toBeVisible();
  await expect(page.getByLabel('Elbow centreline radius R (mm)')).toHaveValue('228.6');
  await expect(metric(page, 'radius')).toContainText('228.6 mm');
  await expect(metric(page, 'circumference')).toContainText('528.73 mm');
});

test('invalid geometry shows an explicit code and never fabricated results', async ({ page }) => {
  await selectFamily(page);

  /* A bend radius below half the OD is not a manufacturable elbow. */
  await page.getByLabel('Elbow centreline radius R (mm)').fill('40');
  await expect(page.locator('[data-geometry-error-code="ELBOW_RADIUS_TOO_SMALL"]')).toBeVisible();
  await expect(page.getByTestId('equal-tube-elbow-results')).toHaveCount(0);
  await page.getByLabel('Elbow centreline radius R (mm)').fill('114.3');
  await expect(page.getByTestId('equal-tube-elbow-results')).toBeVisible();

  /* A tube shorter than the maximum cut-back cannot be marked. */
  await page.getByLabel('Tube length L (mm)').fill('100');
  await expect(page.locator('[data-geometry-error-code="TUBE_TOO_SHORT"]')).toBeVisible();
  await expect(page.getByTestId('equal-tube-elbow-results')).toHaveCount(0);
  await page.getByLabel('Tube length L (mm)').fill('300');
  await expect(page.getByTestId('equal-tube-elbow-results')).toBeVisible();

  /* An empty R is missing data, not zero. */
  await page.getByLabel('Elbow centreline radius R (mm)').fill('');
  await expect(page.locator('[data-geometry-error-code="NON_FINITE_INPUT"]')).toBeVisible();
  await expect(page.getByTestId('equal-tube-elbow-results')).toHaveCount(0);
});

test('divisions change the station count and keep a single closure', async ({ page }) => {
  await selectFamily(page);
  for (const divisions of ['12', '16', '24']) {
    await page.getByLabel('Marking divisions around branch circumference').selectOption(divisions);
    await expect(page.getByTestId('equal-tube-elbow-row')).toHaveCount(Number(divisions) + 1);
    /* Scoped per layout: the closure exists once in the desktop table and once in
       the mobile card list, both present in the DOM at any viewport. */
    await expect(page.getByTestId('equal-tube-elbow-row')
      .filter({ hasText: '360° closure = P1' })).toHaveCount(1);
    await expect(page.getByTestId('equal-tube-elbow-closure')).toHaveCount(1);
    await expect(metric(page, 'circumference')).toContainText('279.288 mm');
  }
});

test('graphic tabs render kernel-projected previews with honest flags', async ({ page }) => {
  await selectFamily(page);

  /* Tube: exact flat development. */
  const panel = page.getByTestId('equal-tube-elbow-graphic');
  await expect(panel).toHaveAttribute('data-graphic', 'tube');
  await expect(panel.locator('svg[data-flat-development="true"]')).toHaveCount(1);

  /* Elbow: a torus has no flat development, and the tab must say so. */
  await page.getByRole('tab', { name: 'Elbow marking' }).click();
  await expect(panel).toHaveAttribute('data-graphic', 'marking');
  await expect(panel.locator('svg[data-flat-development="false"]')).toHaveCount(1);
  await expect(page.getByTestId('equal-tube-elbow-marking-note')).toBeVisible();

  /* Schematic: never to scale, echoes R and the maximum cut-back. */
  await page.getByRole('tab', { name: 'Schematic' }).click();
  await expect(panel).toHaveAttribute('data-graphic', 'schematic');
  await expect(panel.locator('svg[data-not-to-scale="true"]')).toHaveCount(1);
  await expect(panel.locator('svg[data-radius-mm="114.3"]')).toHaveCount(1);
  await expect(panel.locator('svg[data-max-cutback-mm]')).toHaveAttribute('data-max-cutback-mm', /^133\.46/);
});

test('mobile cards stay readable at 375x812 and keep the 90° limit visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await selectFamily(page);

  await expect(page.getByTestId('equal-tube-elbow-physical-station')).toHaveCount(24);
  await expect(page.getByTestId('equal-tube-elbow-closure')).toHaveCount(1);

  const first = page.getByTestId('equal-tube-elbow-physical-station').first();
  await expect(first).toBeVisible();
  await expect(first).toContainText('P1');
  await expect(first).toContainText('300');

  /* The 90° plateau must be labelled on the small screen too. */
  const clamped = page.locator('[data-testid="equal-tube-elbow-physical-station"][data-clamped="true"]');
  await expect(clamped).toHaveCount(13);
  await expect(clamped.first()).toContainText('90° end face');
  await expect(page.getByTestId('equal-tube-elbow-clamp-note')).toBeVisible();
});

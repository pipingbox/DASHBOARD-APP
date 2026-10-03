import { expect, test, type Page } from '@playwright/test';
import { computeElbowOnPipe, type ElbowOnPipeDatum } from '../app/frontend/src/tools/branch/elbowOnPipeGeometry';

const URL = '/tools?t=branch-layout&lng=en';
const INPUT = {
  elbowInnerDiameterMm: 77.92,
  elbowOuterDiameterMm: 88.9,
  elbowCentrelineRadiusMm: 114.3,
  receiverOuterDiameterMm: 168.3,
  divisions: 24,
};

async function openPanel(page: Page) {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: 'Beta Version' });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Tube → elbow' })).toBeVisible();
  await page.getByRole('button', { name: 'Elbow → tube' }).click();
  await expect(page.getByTestId('eop-results')).toBeVisible();
}

function expected(datum: ElbowOnPipeDatum, receiverOuterDiameterMm = INPUT.receiverOuterDiameterMm, elbowCentrelineRadiusMm = INPUT.elbowCentrelineRadiusMm) {
  return computeElbowOnPipe({ ...INPUT, receiverOuterDiameterMm, elbowCentrelineRadiusMm, datum });
}

async function checkStation(page: Page, index: number, datum: ElbowOnPipeDatum) {
  const result = expected(datum);
  expect(result.valid).toBe(true);
  const station = result.stations[index];
  const row = page.getByTestId('eop-station-row').nth(index);
  await expect(row).toContainText(`P${index + 1}`);
  const cells = row.locator('td');
  await expect(cells.nth(1)).toHaveText(`${Number(station.angleDeg.toFixed(1))}°`);
  for (const [column, value] of [station.picajeXMm, station.picajeYMm, station.arcLengthMm, station.arcRadiusMm].entries()) {
    await expect(cells.nth(column + 2)).toHaveText(String(Number(value.toFixed(3))));
  }
  if (station.clampedAtElbowEnd) await expect(row).toContainText('90° limit');
  else await expect(row).not.toContainText('90° limit');
}

test('selector: tube→tube remains default, tube→elbow retains its own results; new family is numeric only', async ({ page }) => {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: 'Beta Version' });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Tube → tube / header' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Tube → elbow' }).click();
  await expect(page.getByTestId('elbow-results')).toBeVisible();
  await page.getByRole('button', { name: 'Elbow → tube' }).click();
  await expect(page.getByTestId('eop-results')).toBeVisible();
  await expect(page.getByTestId('eop-results').locator('svg,canvas')).toHaveCount(0);
  await expect(page.getByTestId('eop-results').getByRole('button', { name: /PDF|print|download/i })).toHaveCount(0);
  await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveCount(0);
  await expect(page.getByTestId('eop-elbow-od')).toHaveText('88.9 mm');
  await expect(page.getByTestId('eop-elbow-id')).toHaveText('77.92 mm');
  await expect(page.getByTestId('eop-receiver-d')).toHaveText('168.3 mm');
  await expect(page.getByLabel('Elbow centreline radius R (mm)')).toHaveValue('114.3');
  await expect(page.getByLabel('Marking divisions around branch circumference')).toHaveValue('24');
  await expect(page.getByTestId('eop-metric-div')).toContainText('11.64 mm');
  await page.getByRole('button', { name: 'Tube → tube / header' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
});

test('EJE physical stations match the pure kernel and independent genuine anchors; closure is not P25', async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId('eop-metric-cotaX')).toContainText('0 mm');
  await expect(page.getByTestId('eop-station-row')).toHaveCount(24);
  await expect(page.getByTestId('eop-closure-row')).toHaveCount(1);
  await expect(page.getByTestId('eop-closure-row')).toContainText('360° closure = P1');
  await expect(page.getByTestId('eop-results')).not.toContainText('P25');
  for (const index of [0, 6, 12, 18, 23]) await checkStation(page, index, { type: 'EJE' });
  await expect(page.getByTestId('eop-station-row').nth(0).locator('td').nth(3)).toHaveText('-19.164');
  await expect(page.getByTestId('eop-station-row').nth(6).locator('td').nth(2)).toHaveText('-40.506');
  await expect(page.getByTestId('eop-station-row').nth(12).locator('td').nth(3)).toHaveText('114.3');
  await expect(page.getByTestId('eop-station-row').nth(18).locator('td').nth(2)).toHaveText('40.506');
});

test('BOP, TOP and FE ±20 keep physical station phase and expose only the kernel clamp', async ({ page }) => {
  await openPanel(page);
  const cases: { label: string; datum: ElbowOnPipeDatum; cota: string; clamped: number[] }[] = [
    { label: 'BOP · bottom', datum: { type: 'BOP' }, cota: '41.34 mm', clamped: [7, 8, 9, 10, 11, 12, 13] },
    { label: 'TOP · top', datum: { type: 'TOP' }, cota: '-41.34 mm', clamped: [13, 14, 15, 16, 17, 18, 19] },
    { label: 'COTA Fe', datum: { type: 'FE', fe: 20 }, cota: '-20.19 mm', clamped: [13, 14, 15, 16] },
    { label: 'COTA Fe', datum: { type: 'FE', fe: -20 }, cota: '20.19 mm', clamped: [10, 11, 12, 13] },
  ];
  for (const { label, datum, cota, clamped } of cases) {
    await page.getByRole('button', { name: label }).click();
    if (datum.type === 'FE') {
      await expect(page.getByLabel('Signed offset Fe (mm)')).toBeVisible();
      await page.getByLabel('Signed offset Fe (mm)').fill(String(datum.fe));
    } else await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveCount(0);
    await expect(page.getByTestId('eop-metric-cotaX')).toContainText(cota);
    for (const index of [0, 6, 12, 18]) await checkStation(page, index, datum);
    const marked = await page.getByTestId('eop-station-row').evaluateAll(rows =>
      rows.flatMap((row, index) => row.textContent?.includes('90° limit') ? [index + 1] : []));
    expect(marked).toEqual(clamped);
  }
  await page.getByLabel('Signed offset Fe (mm)').fill('0');
  await expect(page.getByTestId('eop-metric-cotaX')).toContainText('0 mm');
  await checkStation(page, 6, { type: 'EJE' });
  await page.getByRole('button', { name: 'EJE · axis' }).click();
  await expect(page.getByLabel('Signed offset Fe (mm)')).toHaveCount(0);
});

test('Y′ blank → 100 changes only the external positioning dimension, never geometry', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  const tablesBefore = await page.getByTestId('eop-results').locator('table').textContent();
  const cotaBefore = await page.getByTestId('eop-metric-cotaX').textContent();
  const divBefore = await page.getByTestId('eop-metric-div').textContent();
  await expect(page.getByTestId('eop-metric-yPrime')).toHaveCount(0);
  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('100');
  await expect(page.getByTestId('eop-metric-yPrime')).toContainText('100 mm');
  expect(await page.getByTestId('eop-results').locator('table').textContent()).toBe(tablesBefore);
  expect(await page.getByTestId('eop-metric-cotaX').textContent()).toBe(cotaBefore);
  expect(await page.getByTestId('eop-metric-div').textContent()).toBe(divBefore);
  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('');
  await expect(page.getByTestId('eop-metric-yPrime')).toHaveCount(0);
});

test('invalid Fe and receiver diameter show localized errors without fabricated rows', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.getByLabel('Signed offset Fe (mm)').fill('50');
  await expect(page.locator('[data-geometry-error-code="OFFSET_OUT_OF_RANGE"]')).toBeVisible();
  await expect(page.getByTestId('eop-results')).toHaveCount(0);
  await page.getByLabel('Signed offset Fe (mm)').fill('');
  await expect(page.locator('[data-geometry-error-code="NON_FINITE_INPUT"]')).toBeVisible();
  await page.getByRole('button', { name: 'EJE · axis' }).click();
  await expect(page.getByTestId('eop-results')).toBeVisible();
  await page.getByLabel('Elbow centreline radius R (mm)').fill('-1');
  await expect(page.locator('[data-geometry-error-code="NON_POSITIVE_DIMENSION"]')).toBeVisible();
  await expect(page.getByTestId('eop-results')).toHaveCount(0);
  await page.getByLabel('Elbow centreline radius R (mm)').fill('114.3');
  await page.locator('#eop-receiver-nps').selectOption('2"');
  await expect(page.locator('[data-geometry-error-code="ELBOW_EXCEEDS_RECEIVER"]')).toBeVisible();
  await expect(page.getByTestId('eop-results')).toHaveCount(0);
});

test('R and D variations display the kernel results, including the nonlinear receiver arc', async ({ page }) => {
  await openPanel(page);
  await page.getByLabel('Elbow centreline radius R (mm)').fill('228.6');
  await expect(page.getByTestId('eop-station-row').nth(12).locator('td').nth(3)).toHaveText('228.6');
  await page.getByLabel('Elbow centreline radius R (mm)').fill('114.3');
  await page.locator('#eop-receiver-nps').selectOption('8"');
  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  await expect(page.getByTestId('eop-receiver-d')).toHaveText('219.1 mm');
  await expect(page.getByTestId('eop-metric-cotaX')).toContainText('69.71 mm');
  const result = expected({ type: 'BOP' }, 219.1);
  expect(result.valid).toBe(true);
  await expect(page.getByTestId('eop-station-row').nth(6).locator('td').nth(2)).toHaveText(String(Number(result.stations[6].picajeXMm.toFixed(3))));
});

test('mobile 390 px: inputs, datums, Y′, summary and station cards have no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page);
  await expect(page.getByTestId('eop-station')).toHaveCount(24);
  await expect(page.getByTestId('eop-closure')).toHaveCount(1);
  await expect(page.getByTestId('eop-results').locator('table')).toBeHidden();
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await expect(page.getByLabel('Signed offset Fe (mm)')).toBeVisible();
  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('100');
  await expect(page.getByTestId('eop-metric-yPrime')).toContainText('100 mm');
  await expect(page.getByTestId('eop-station').nth(12)).toContainText('90° limit');
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
});

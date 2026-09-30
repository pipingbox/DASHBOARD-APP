import { expect, test, type Locator, type Page } from '@playwright/test';

/* U3 — tubo→codo graphical previews in the real DOM.
   Numeric traceability against U1 is proven by
   scripts/test-branch-on-elbow-svg.ts; this spec verifies the rendered
   integration: tabs, datum-driven redraw, invalid state and responsiveness. */

const TOOL_URL = '/tools?t=branch-layout&lng=en';

async function openElbow(page: Page) {
  await page.goto(TOOL_URL);
  const beta = page.getByRole('dialog', { name: 'Beta Version' });
  if (await beta.isVisible()) await beta.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Tube → elbow' }).click();
  await expect(page.getByTestId('elbow-results')).toBeVisible();
}

const graphic = (page: Page) => page.getByTestId('elbow-graphic');
const tab = (page: Page, name: string) => page.getByRole('tab', { name });

async function attr(locator: Locator, name: string): Promise<number> {
  const value = await locator.getAttribute(name);
  return Number.parseFloat(value ?? 'NaN');
}

test('injerto development renders the U1 stations with a real closure', async ({ page }) => {
  await openElbow(page);
  await expect(tab(page, 'Injerto')).toHaveAttribute('aria-selected', 'true');
  await expect(graphic(page)).toHaveAttribute('data-graphic', 'injerto');
  const svg = graphic(page).locator('svg');
  await expect(svg).toHaveAttribute('data-preview', 'branch-on-elbow-development');
  await expect(svg).toHaveAttribute('data-station-count', '24');
  await expect(graphic(page).locator('[data-station-kind="physical"]')).toHaveCount(24);
  await expect(graphic(page).locator('[data-station-kind="closure"]')).toHaveCount(1);
  await expect(graphic(page).locator('[data-cut-curve="u1-stations"]')).toHaveCount(1);

  /* The plotted P1 ordinate must equal the ordinate shown in the numeric table. */
  const plotted = await attr(graphic(page).locator('[data-station="0"]'), 'data-injerto-mm');
  expect(Math.abs(plotted - 183.647)).toBeLessThan(0.001);
  /* The closure repeats P1 rather than inventing a 25th station. */
  const closure = graphic(page).locator('[data-station-kind="closure"]');
  expect(Math.abs(await attr(closure, 'data-injerto-mm') - plotted)).toBeLessThan(1e-9);
  expect(Math.abs(await attr(closure, 'data-arc-mm') - 279.2876)).toBeLessThan(0.001);
  /* Screen preview only: no print/PDF/page-format affordance in this family. */
  await expect(page.getByRole('button', { name: /Print|PDF/i })).toHaveCount(0);
});

test('picaje preview follows the datum and mirrors signed Fe', async ({ page }) => {
  await openElbow(page);
  await tab(page, 'Picaje').click();
  const svg = graphic(page).locator('svg');
  await expect(svg).toHaveAttribute('data-preview', 'branch-on-elbow-picaje');
  await expect(graphic(page).locator('[data-picaje-contour="u1-stations"]')).toHaveAttribute('data-contour-points', '24');
  await expect(graphic(page).locator('[data-station-kind="physical"]')).toHaveCount(24);
  await expect(graphic(page).locator('[data-origin="omega"]')).toHaveCount(1);

  const readState = async () => ({
    cotaX: await attr(svg, 'data-cota-x-mm'),
    offset: await attr(svg, 'data-datum-offset-mm'),
    contour: await graphic(page).locator('[data-picaje-contour="u1-stations"]').getAttribute('points'),
  });
  const eje = await readState();
  expect(eje.cotaX).toBe(0);
  expect(eje.offset).toBe(0);

  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  const bop = await readState();
  expect(Math.abs(bop.cotaX + 41.343)).toBeLessThan(0.001);
  expect(bop.offset).toBeCloseTo(-39.7, 6);
  expect(bop.contour).not.toBe(eje.contour);

  await page.getByRole('button', { name: 'TOP · top' }).click();
  const top = await readState();
  expect(Math.abs(top.cotaX - 41.343)).toBeLessThan(0.001);
  expect(top.offset).toBeCloseTo(39.7, 6);
  expect(top.contour).not.toBe(bop.contour);
  expect(top.contour).not.toBe(eje.contour);

  await page.getByRole('button', { name: 'COTA Fe' }).click();
  const fePlus = await readState();
  expect(Math.abs(fePlus.cotaX - 20.193)).toBeLessThan(0.001);
  expect(fePlus.offset).toBe(20);
  await page.getByLabel('Signed offset Fe (mm)').fill('-20');
  const feMinus = await readState();
  expect(Math.abs(feMinus.cotaX + 20.193)).toBeLessThan(0.001);
  expect(feMinus.offset).toBe(-20);
  expect(feMinus.contour).not.toBe(fePlus.contour);
});

test('geometry schematic shows the inputs and the resolved datum offset', async ({ page }) => {
  await openElbow(page);
  await tab(page, 'Geometry').click();
  const svg = graphic(page).locator('svg');
  await expect(svg).toHaveAttribute('data-preview', 'branch-on-elbow-schematic');
  await expect(svg).toHaveAttribute('data-r-mm', '228.6');
  await expect(svg).toHaveAttribute('data-d-mm', '168.3');
  await expect(svg).toHaveAttribute('data-a-mm', '150');
  await expect(svg).toHaveAttribute('data-l-mm', '200');
  await expect(svg).toHaveAttribute('data-datum', 'EJE');
  await expect(svg).toHaveAttribute('data-datum-offset-mm', '0');
  await expect(graphic(page).locator('[data-branch-band="true"]')).toHaveCount(1);
  await expect(graphic(page).locator('[data-elbow-band="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  await expect(svg).toHaveAttribute('data-datum', 'BOP');
  await expect(svg).toHaveAttribute('data-datum-offset-mm', '-39.7');
});

test('invalid geometry renders no development at all', async ({ page }) => {
  await openElbow(page);
  await expect(graphic(page)).toBeVisible();
  await page.getByLabel('Axis height a (mm)').fill('400');
  await expect(page.locator('[data-geometry-error-code="NO_INTERSECTION"]')).toBeVisible();
  await expect(graphic(page)).toHaveCount(0);
  await expect(page.locator('[data-preview]')).toHaveCount(0);
  await page.getByLabel('Axis height a (mm)').fill('150');
  await expect(graphic(page)).toBeVisible();
});

for (const width of [360, 390]) {
  test(`graphics stay responsive without page overflow at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await openElbow(page);
    for (const name of ['Injerto', 'Picaje', 'Geometry']) {
      await tab(page, name).click();
      const svg = graphic(page).locator('svg');
      await expect(svg).toBeVisible();
      await expect(svg).toHaveAttribute('viewBox', /^0 0 \d+ \d+$/);
      const box = await svg.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width);
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    }
  });
}

test('straight tube→tube family keeps its own flow with no elbow graphics', async ({ page }) => {
  await page.goto(TOOL_URL);
  const beta = page.getByRole('dialog', { name: 'Beta Version' });
  if (await beta.isVisible()) await beta.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
  await expect(page.getByTestId('elbow-graphic')).toHaveCount(0);
  await expect(page.locator('[data-preview="branch-on-elbow-development"]')).toHaveCount(0);
});

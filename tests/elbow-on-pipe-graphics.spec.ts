import { expect, test } from '@playwright/test';

/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.3
 * CODO → TUBO screen previews: receiver picaje, elbow marking, schematic.
 *
 * Numeric traceability of every plotted point against the U5.1 kernel lives in
 * `scripts/test-elbow-on-pipe-svg.ts` (231 checks, 245 traced points). This spec
 * covers only what needs a real browser: that the previews reach the DOM, that
 * they react to the datum and to R / D, that Cota Y′ moves nothing, and that the
 * SVGs fit a 360 px viewport without pushing the page sideways.
 *
 * It also pins the negative contract of the unit: screen output only — no page
 * format, no tiling, no calibration bar, no download or print action.
 */

const TOOL_URL = '/tools?t=branch-layout&lng=en';
const FAMILY = 'Elbow → tube';
type Page = import('@playwright/test').Page;

async function selectElbowOnPipe(page: Page) {
  await page.goto(TOOL_URL);
  const betaDialog = page.getByRole('dialog', { name: 'Beta Version' });
  if (await betaDialog.isVisible()) await betaDialog.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: FAMILY, exact: true }).click();
  await expect(page.getByTestId('elbow-on-pipe-results')).toBeVisible();
}

const graphic = (page: Page) => page.getByTestId('elbow-on-pipe-graphic');
const svg = (page: Page) => graphic(page).locator('svg');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const radius = (page: Page) => page.getByLabel('Elbow centreline radius R (mm)');
const receiverNps = (page: Page) => page.getByLabel('NPS Size').nth(1);
const yPrime = (page: Page) => page.getByLabel('Cota Y′ · positioning reference (mm)');
const fe = (page: Page) => page.getByLabel('Signed Fe (mm)');

/** Every plotted station, in DOM order, with its kernel millimetres. */
async function stations(page: Page) {
  return svg(page).locator('[data-station]').evaluateAll(nodes => nodes.map(node => ({
    index: node.getAttribute('data-station'),
    kind: node.getAttribute('data-station-kind'),
    x: node.getAttribute('data-picaje-x-mm'),
    y: node.getAttribute('data-picaje-y-mm'),
    arc: node.getAttribute('data-arc-mm'),
    arcLength: node.getAttribute('data-arc-length-mm'),
    arcRadius: node.getAttribute('data-arc-radius-mm'),
    bend: node.getAttribute('data-bend-angle-deg'),
    clamped: node.getAttribute('data-clamped'),
    tag: node.tagName.toLowerCase(),
  })));
}

const contour = (page: Page) => svg(page).locator('[data-picaje-contour]').getAttribute('points');

/** Every drawn path/polyline/polygon of the current preview. */
const shapes = (page: Page) => svg(page).locator('polyline, polygon, path').evaluateAll(
  nodes => nodes.map(node => node.getAttribute('points') ?? node.getAttribute('d')));

test('the three previews render and are driven by the kernel stations', async ({ page }) => {
  await selectElbowOnPipe(page);

  /* A — receiver picaje: N physical points, closed on P1, kernel order. */
  await expect(graphic(page)).toHaveAttribute('data-graphic', 'picaje');
  await expect(svg(page)).toHaveAttribute('data-preview', 'elbow-on-pipe-picaje');
  await expect(svg(page)).toHaveAttribute('data-station-count', '24');
  await expect(svg(page)).toHaveAttribute('data-cota-x-mm', '0');
  expect(Number(await svg(page).getAttribute('data-seating-height-mm'))).toBeCloseTo(159.49, 6);
  const picaje = await stations(page);
  expect(picaje).toHaveLength(24);
  expect(picaje.map(station => station.index)).toEqual([...Array(24).keys()].map(String));
  expect(picaje.every(station => station.kind === 'physical')).toBe(true);
  await expect(svg(page).locator('[data-picaje-contour="kernel-stations"]')).toHaveAttribute('data-closes-on', '0');
  await expect(svg(page).locator('[data-picaje-contour="kernel-stations"]')).toHaveAttribute('data-contour-points', '24');
  /* The default case reaches the 90° end face at the intrados: station 12. */
  await expect(svg(page)).toHaveAttribute('data-clamped-count', '1');
  expect(picaje.filter(station => station.clamped === 'true').map(station => station.index)).toEqual(['12']);
  expect(picaje[12].tag).toBe('polygon');
  expect(picaje[0].tag).toBe('circle');
  expect(picaje[12].y).toBe('114.3');

  /* B — elbow marking: N physical points plus one closure, never a 1:1 claim. */
  await tab(page, 'Elbow marking').click();
  await expect(graphic(page)).toHaveAttribute('data-graphic', 'marking');
  await expect(svg(page)).toHaveAttribute('data-preview', 'elbow-on-pipe-marking');
  await expect(svg(page)).toHaveAttribute('data-flat-development', 'false');
  const marking = await stations(page);
  expect(marking).toHaveLength(25);
  expect(marking.filter(station => station.kind === 'closure')).toHaveLength(1);
  expect(marking[24].kind).toBe('closure');
  expect(Number(marking[24].arc)).toBeCloseTo(Math.PI * 88.9, 9);
  expect(Number(marking[24].arcLength)).toBeCloseTo(Number(marking[0].arcLength), 9);
  await expect(svg(page).locator('[data-limit-curve="elbow-end-face"]')).toHaveCount(1);
  await expect(svg(page).locator('[data-cut-curve="kernel-stations"]')).toHaveCount(1);
  await expect(svg(page).locator('[data-angle-curve="bend-angle"]')).toHaveCount(1);
  await expect(svg(page).locator('[data-station-line]')).toHaveCount(25);
  /* The clamped station sits exactly on the 90° end face, nowhere below it. */
  const clamped = marking.find(station => station.clamped === 'true')!;
  expect(clamped.bend).toBe('90');
  expect(Number(clamped.arcLength)).toBeCloseTo(Number(clamped.arcRadius) * Math.PI / 2, 9);
  expect(clamped.tag).toBe('polygon');
  await expect(page.getByTestId('elbow-on-pipe-marking-note')).toContainText('no exact flat development');

  /* C — schematic: explanatory, declared not to scale. */
  await tab(page, 'Geometry').click();
  await expect(graphic(page)).toHaveAttribute('data-graphic', 'schematic');
  await expect(svg(page)).toHaveAttribute('data-preview', 'elbow-on-pipe-schematic');
  await expect(svg(page)).toHaveAttribute('data-datum', 'EJE');
  await expect(svg(page)).toHaveAttribute('data-r-mm', '114.3');
  await expect(svg(page)).toHaveAttribute('data-d-mm', '168.3');
  await expect(svg(page)).toHaveAttribute('data-elbow-od-mm', '88.9');
  await expect(svg(page)).toHaveAttribute('data-elbow-id-mm', '77.92');
  for (const marker of ['receiver-band', 'elbow-band', 'end-face', 'leg-plane', 'elbow-od', 'elbow-id', 'datum-line']) {
    await expect(svg(page).locator(`[data-${marker}="true"]`)).toHaveCount(1);
  }
  await expect(graphic(page)).toContainText('not to scale');
  await expect(graphic(page)).toContainText('End face · 90°');
  await expect(graphic(page)).toContainText('BOP +39.70');
  await expect(graphic(page)).toContainText('TOP -39.70');
});

test('the datum reshapes the previews and the 90° plateau grows with it', async ({ page }) => {
  await selectElbowOnPipe(page);
  const eje = await stations(page);
  const ejeContour = await contour(page);

  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  await expect(svg(page)).toHaveAttribute('data-clamped-count', '7');
  const bop = await stations(page);
  expect(await contour(page)).not.toBe(ejeContour);
  expect(bop.map(station => station.x)).not.toEqual(eje.map(station => station.x));
  /* BOP displaces the bend plane toward +X in this family: Cota X′ > 0. */
  const bopCotaX = Number(await svg(page).getAttribute('data-cota-x-mm'));
  expect(bopCotaX).toBeGreaterThan(0);
  /* Clamped stations stay drawn as diamonds, never hidden. */
  const bopClamped = bop.filter(station => station.clamped === 'true');
  expect(bopClamped).toHaveLength(7);
  expect(bopClamped.every(station => station.tag === 'polygon')).toBe(true);

  await page.getByRole('button', { name: 'TOP · top' }).click();
  const topCotaX = Number(await svg(page).getAttribute('data-cota-x-mm'));
  expect(topCotaX).toBeLessThan(0);
  expect(topCotaX + bopCotaX).toBeCloseTo(0, 9);
  const topContour = await contour(page);
  expect(topContour).not.toBe(ejeContour);
  const top = await stations(page);
  expect(top.map(station => station.x)).not.toEqual(bop.map(station => station.x));

  /* FE +20 and FE −20 must land on opposite sides of the receiver crown. */
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await fe(page).fill('20');
  const fePlusContour = await contour(page);
  const fePlusCotaX = Number(await svg(page).getAttribute('data-cota-x-mm'));
  await fe(page).fill('-20');
  const feMinusCotaX = Number(await svg(page).getAttribute('data-cota-x-mm'));
  expect(await contour(page)).not.toBe(fePlusContour);
  expect(fePlusCotaX).toBeLessThan(0);
  expect(feMinusCotaX).toBeGreaterThan(0);
  expect(fePlusCotaX + feMinusCotaX).toBeCloseTo(0, 9);
  /* The schematic follows the datum too, with the kernel offset on screen. */
  await tab(page, 'Geometry').click();
  await expect(svg(page)).toHaveAttribute('data-datum', 'FE');
  await expect(svg(page)).toHaveAttribute('data-datum-offset-mm', '20');
});

test('R and D variations change the drawing because it is data driven', async ({ page }) => {
  await selectElbowOnPipe(page);
  const baseContour = await contour(page);
  const baseStations = await stations(page);

  /* R variation: 228.60 mm, EJE, same receiver. */
  await radius(page).fill('228.6');
  await expect(svg(page)).toHaveAttribute('data-seating-height-mm', '273.79');
  const rContour = await contour(page);
  expect(rContour).not.toBe(baseContour);
  const rStations = await stations(page);
  expect(rStations.map(station => station.y)).not.toEqual(baseStations.map(station => station.y));
  /* The elbow OD did not change, so the picaje X ring is the same: only the
     meridional geometry moved. That is exactly what R should do. */
  expect(rStations.map(station => station.x)).toEqual(baseStations.map(station => station.x));
  await tab(page, 'Elbow marking').click();
  expect(Number(await svg(page).getAttribute('data-circumference-mm'))).toBeCloseTo(Math.PI * 88.9, 9);
  await tab(page, 'Geometry').click();
  await expect(svg(page)).toHaveAttribute('data-r-mm', '228.6');

  /* D variation: receiver 8", BOP, back to R = 114.30 mm. */
  await radius(page).fill('114.3');
  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  await tab(page, 'Receiver picaje').click();
  const bopContour = await contour(page);
  const bopCotaX = Number(await svg(page).getAttribute('data-cota-x-mm'));
  await receiverNps(page).selectOption('8"');
  expect(Number(await svg(page).getAttribute('data-seating-height-mm'))).toBeCloseTo(163.449, 3);
  expect(await contour(page)).not.toBe(bopContour);
  expect(Number(await svg(page).getAttribute('data-cota-x-mm'))).not.toBe(bopCotaX);
  await tab(page, 'Geometry').click();
  await expect(svg(page)).toHaveAttribute('data-d-mm', '219.1');
});

test("Cota Y′ annotates the previews without moving one single point", async ({ page }) => {
  await selectElbowOnPipe(page);

  const TABS = ['Receiver picaje', 'Elbow marking', 'Geometry'] as const;
  const before: Record<string, unknown> = {};
  for (const name of TABS) {
    await tab(page, name).click();
    await expect(svg(page)).toHaveCount(1);
    before[name] = {
      stations: await stations(page),
      contour: name === 'Receiver picaje' ? await contour(page) : null,
      shapes: await shapes(page),
      clampedCount: await svg(page).getAttribute('data-clamped-count'),
    };
    expect(await svg(page).getAttribute('data-external-cota-y-mm')).toBeNull();
  }

  await yPrime(page).fill('100');

  for (const name of TABS) {
    await tab(page, name).click();
    /* The only admissible change: the external annotation shows up. */
    await expect(svg(page)).toHaveAttribute('data-external-cota-y-mm', '100');
    await expect(graphic(page)).toContainText('100.00 mm');
    expect({
      stations: await stations(page),
      contour: name === 'Receiver picaje' ? await contour(page) : null,
      shapes: await shapes(page),
      clampedCount: await svg(page).getAttribute('data-clamped-count'),
    }).toEqual(before[name]);
  }

  /* And the numeric table U5.2a already owned stays untouched too. */
  await expect(page.getByTestId('elbow-on-pipe-row')).toHaveCount(25);
});

test('invalid geometry removes the previews instead of drawing something wrong', async ({ page }) => {
  await selectElbowOnPipe(page);
  await expect(graphic(page)).toBeVisible();

  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await fe(page).fill('85');
  await expect(page.getByRole('alert')).toHaveAttribute('data-geometry-error-code', 'OFFSET_OUT_OF_RANGE');
  await expect(graphic(page)).toHaveCount(0);
  await expect(page.getByTestId('elbow-on-pipe-results')).toHaveCount(0);

  await fe(page).fill('20');
  await expect(graphic(page)).toBeVisible();
  /* Elbow wider than the receiver: the SET-ON family cannot be drawn at all. */
  await receiverNps(page).selectOption('2"');
  await expect(page.getByRole('alert')).toHaveAttribute('data-geometry-error-code', 'ELBOW_EXCEEDS_RECEIVER');
  await expect(graphic(page)).toHaveCount(0);

  await receiverNps(page).selectOption('6"');
  await expect(graphic(page)).toBeVisible();
  await radius(page).fill('');
  await expect(page.getByRole('alert')).toHaveAttribute('data-geometry-error-code', 'NON_FINITE_INPUT');
  await expect(graphic(page)).toHaveCount(0);
});

for (const width of [390, 360]) {
  test(`previews fit a ${width} px viewport without pushing the page sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await selectElbowOnPipe(page);

    for (const [name, expected] of [
      ['Receiver picaje', 24], ['Elbow marking', 25], ['Geometry', 0],
    ] as const) {
      await tab(page, name).click();
      await expect(svg(page)).toBeVisible();
      /* Responsive contract: viewBox + width:100%, never an intrinsic px width. */
      await expect(svg(page)).toHaveAttribute('viewBox', /^0 0 \d+ \d+$/);
      expect(await svg(page).getAttribute('width')).toBeNull();
      const box = (await svg(page).boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(width);
      /* No physical station is dropped to make room on a narrow screen. */
      if (expected > 0) expect(await stations(page)).toHaveLength(expected);
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    }
  });
}

test('screen previews stay screen-only: no page format, tiling, calibration or download inside the graphics', async ({ page }) => {
  await selectElbowOnPipe(page);
  for (const name of ['Receiver picaje', 'Elbow marking', 'Geometry']) {
    await tab(page, name).click();
    await expect(svg(page)).toHaveAttribute('data-screen-preview', 'true');
    const markup = await graphic(page).innerHTML();
    expect(markup).not.toMatch(/data-(page-format|tile|calibration)/);
    expect(markup).not.toMatch(/\bA[0-4]\b/);
    expect(markup).not.toMatch(/calibration/i);
    /* The disclaimer stays on every preview: screen only, never a 1:1 sheet. */
    expect(markup).toContain('not a 1:1 template');
    await expect(graphic(page).getByRole('button')).toHaveCount(0);
  }
  /* Since U5.4 the physical actions exist, but only inside the fabrication block, never in the previews. */
  const fabrication = page.getByTestId('elbow-on-pipe-fabrication');
  for (const name of [/download/i, /print/i, /1:1/, /PDF/i]) {
    const all = await page.getByRole('button', { name }).count();
    const inFabrication = await fabrication.getByRole('button', { name }).count();
    expect(all).toBe(inFabrication);
  }
});

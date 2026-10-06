import { expect, test } from '@playwright/test';

/**
 * PB-PIPE-COMB-CORRECTION-001 — P2
 * Genuine pipe comb (peines de tubería) UI: numeric + SVG contract.
 *
 * Expected numbers are NOT hand-written: they are the genuine Tubero source
 * corpus values (REF-01..REF-05) validated 5/5 by the P1 kernel, which the
 * panel calls exclusively (the UI never re-implements the geometry).
 */

const TOOL_URL = '/tools?t=pipe-comb&lng=en';

async function openTool(page: import('@playwright/test').Page) {
  await page.goto(TOOL_URL);
  /* The Beta modal mounts after hydration; dismiss it deterministically so
     it never intercepts pointer events. */
  const betaDialog = page.getByRole('dialog', { name: 'Beta Version' });
  const shown = await betaDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (shown) {
    await betaDialog.getByRole('button', { name: 'Continue' }).click();
    await betaDialog.waitFor({ state: 'hidden' });
  }
}

function metric(page: import('@playwright/test').Page, key: string) {
  return page.locator(`[data-testid="pipe-comb-stagger-metric"][data-metric="${key}"]`);
}

function setValues(page: import('@playwright/test').Page, values: Partial<Record<'count' | 'di' | 'df' | 'angle', string>>) {
  const map = {
    count: '#pipe-comb-pipe-count',
    di: '#pipe-comb-initial-spacing',
    df: '#pipe-comb-final-spacing',
    angle: '#pipe-comb-angle',
  } as const;
  return (async () => {
    for (const [key, selector] of Object.entries(map)) {
      const v = values[key as keyof typeof values];
      if (v === undefined) continue;
      await page.locator(selector).fill(v);
    }
  })();
}

test('A/B/C: tool opens with title and genuine REF-01 defaults', async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('heading', { name: 'Pipe Comb' })).toBeVisible();
  await expect(page.locator('#pipe-comb-pipe-count')).toHaveValue('4');
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('200');
  await expect(page.locator('#pipe-comb-final-spacing')).toHaveValue('400');
  await expect(page.locator('#pipe-comb-angle')).toHaveValue('45');
  /* Core form must not expose the old advanced fields. */
  await expect(page.getByText('NPS', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Schedule', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CLR', { exact: true })).toHaveCount(0);
});

test('D/E/F/G: REF-01 results, table and cumulative values', async ({ page }) => {
  await openTool(page);
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await expect(metric(page, 'totalStagger')).toHaveText('1097.06 mm');
  await expect(metric(page, 'angle')).toHaveText('45°');
  await expect(metric(page, 'direction')).toHaveText('Stagger forward');
  const rows = page.locator('[data-testid="pipe-comb-stagger-row"]');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator('td').nth(1)).toHaveText('0 mm');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('Reference');
  await expect(rows.nth(3).locator('td').nth(1)).toHaveText('1097.06 mm');
  await expect(rows.nth(3).locator('td').nth(2)).toHaveText('365.69 mm');
});

test('H/I: SVG present with Di/Df/A/theta annotations', async ({ page }) => {
  await openTool(page);
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('data-direction', 'positive');
  await expect(svg).toHaveAttribute('data-pipe-count', '4');
  await expect(svg.locator('[data-testid="pipe-comb-dim-initial"]')).toHaveText('Di 200 mm');
  await expect(svg.locator('[data-testid="pipe-comb-dim-final"]')).toHaveText('Df 400 mm');
  await expect(svg.locator('[data-testid="pipe-comb-dim-stagger"]')).toHaveText('A 365.69 mm');
  await expect(svg.locator('[data-testid="pipe-comb-angle-label"]')).toHaveText('Angle 45°');
  await expect(svg.locator('[data-testid="pipe-comb-pipe-label"]')).toHaveCount(4);
});

test('J: equal numerical spacing still staggers (REF-02)', async ({ page }) => {
  await openTool(page);
  await setValues(page, { di: '200', df: '200' });
  await expect(metric(page, 'cotaA')).toHaveText('82.84 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger forward');
});

test('K: negative stagger keeps the sign and flips the drawing (REF-03)', async ({ page }) => {
  await openTool(page);
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toHaveAttribute('data-direction', 'positive');
  await setValues(page, { di: '400', df: '200' });
  await expect(metric(page, 'cotaA')).toHaveText('-117.16 mm');
  await expect(metric(page, 'direction')).toHaveText('Stagger backward');
  await expect(svg).toHaveAttribute('data-direction', 'negative');
  /* The drawing itself must differ, not only the sign: with negative A the
     elbow screen-Y ordering is reversed (elbows stagger +u in the model,
     which flips on the SVG axis). */
  const ys = await svg.evaluate((el: SVGSVGElement) =>
    Array.from(el.querySelectorAll('circle')).map((c) => Number(c.getAttribute('cy'))),
  );
  expect(ys.length).toBe(4);
  /* Screen Y grows downward; model E_k.y = −k·A = +k·|A| increases with k,
     so screen cy must strictly DECREASE for the negative case. */
  const ascending = ys.every((y, i) => i === 0 || y < ys[i - 1]);
  expect(ascending).toBe(true);
});

test('L: 30 degree preset gives REF-04', async ({ page }) => {
  await openTool(page);
  await page.locator('[data-testid="pipe-comb-preset-30"]').click();
  await expect(page.locator('#pipe-comb-angle')).toHaveValue('30');
  await expect(metric(page, 'cotaA')).toHaveText('453.59 mm');
});

test('M: 90 degree preset gives REF-05', async ({ page }) => {
  await openTool(page);
  await page.locator('[data-testid="pipe-comb-preset-90"]').click();
  await expect(metric(page, 'cotaA')).toHaveText('400 mm');
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('data-direction', 'positive');
});

test('N: custom angle 37 degrees works', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '37' });
  await expect(page.locator('[data-testid="pipe-comb-error"]')).toHaveCount(0);
  await expect(metric(page, 'angle')).toHaveText('37°');
  const text = await metric(page, 'cotaA').textContent();
  expect(text).toMatch(/^3\d\d\.\d\d mm$/);
});

test('O: 12 pipes render 12 rows and a finite SVG', async ({ page }) => {
  await openTool(page);
  await setValues(page, { count: '12' });
  await expect(page.locator('[data-testid="pipe-comb-stagger-row"]')).toHaveCount(12);
  const svg = page.locator('[data-testid="pipe-comb-stagger-svg"]');
  await expect(svg).toHaveAttribute('data-pipe-count', '12');
  await expect(svg.locator('[data-testid="pipe-comb-pipe-label"]')).toHaveCount(12);
});

test('P: invalid spacing shows a localized error', async ({ page }) => {
  await openTool(page);
  await setValues(page, { di: '0' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toHaveAttribute('data-code', 'initial_spacing_positive');
  await expect(error).not.toHaveText('');
  await expect(page.locator('[data-testid="pipe-comb-stagger-results"] table')).toHaveCount(0);
});

test('Q: angle 0 is invalid', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '0' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('data-code', 'elbow_angle_range');
});

test('R: angle above 90 is invalid', async ({ page }) => {
  await openTool(page);
  await setValues(page, { angle: '90.0001' });
  const error = page.locator('[data-testid="pipe-comb-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('data-code', 'elbow_angle_range');
});

test('S: mm/in toggle preserves the physical result', async ({ page }) => {
  await openTool(page);
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await page.getByRole('button', { name: 'in', exact: true }).click();
  /* 365.685424... mm = 14.397 in — same physical value, converted. */
  await expect(metric(page, 'cotaA')).toHaveText('14.397 in');
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('7.874');
  await page.getByRole('button', { name: 'mm', exact: true }).click();
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await expect(page.locator('#pipe-comb-initial-spacing')).toHaveValue('200');
});

test('T: navigating away and back through the catalog still renders', async ({ page }) => {
  await openTool(page);
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await page.getByRole('button', { name: 'Back to catalog' }).click();
  /* The catalog card itself carries an h3 "Pipe Comb", so assert on
     tool-specific markers instead of the heading. */
  await expect(page.locator('[data-testid="pipe-comb-stagger-results"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="pipe-comb-stagger-svg"]')).toHaveCount(0);
  /* The catalog card's accessible name embeds its description text. */
  await page.getByRole('button', { name: /^Pipe Comb\b/ }).first().click();
  await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
  await expect(page.locator('[data-testid="pipe-comb-stagger-svg"]')).toBeVisible();
});

test('responsive: no page-level horizontal overflow at 320px / 390px', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await openTool(page);
    await expect(metric(page, 'cotaA')).toHaveText('365.69 mm');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    /* Negative case: the signed value must not be clipped. */
    await setValues(page, { di: '400', df: '200' });
    await expect(metric(page, 'cotaA')).toHaveText('-117.16 mm');
    const overflowNeg = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowNeg).toBeLessThanOrEqual(1);
  }
});

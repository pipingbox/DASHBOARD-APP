import { expect, test } from '@playwright/test';

/* PB-BRANCH-INJERTO-EXPANSION-001 U4 — fabrication outputs for tube → elbow.
   Verifies the UI exposes the physical artifacts honestly (cut template 1:1 vs
   marking guide), the paper selector only changes pagination, downloads deliver
   PDFs with the right MediaBox, and the tube → tube actions remain untouched. */

const TOOL_URL = '/tools?t=branch-layout&lng=en';
const MM2PT = 72 / 25.4;

async function openElbow(page: import('@playwright/test').Page) {
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
  await page.getByRole('button', { name: 'Tube → elbow' }).click();
  await expect(page.getByTestId('elbow-results')).toBeVisible();
  await expect(page.getByTestId('elbow-fabrication')).toBeVisible();
}

async function downloadPdf(page: import('@playwright/test').Page, testId: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId(testId).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('latin1') };
}

function mediaBoxes(pdf: string): number[][] {
  return [...pdf.matchAll(/\/MediaBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/g)].map(m => m.slice(1, 5).map(Number));
}

test('fabrication section labels the two artifacts honestly and states the print policy', async ({ page }) => {
  await openElbow(page);
  const section = page.getByTestId('elbow-fabrication');
  await expect(section.getByRole('button', { name: 'Download branch cut template 1:1 (PDF)' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Download elbow marking guide (PDF)' })).toBeVisible();
  await expect(section.getByRole('button', { name: /picaje template 1:1/i })).toHaveCount(0);
  await expect(section.getByText(/no exact flat development, so no 1:1 hole template is produced/)).toBeVisible();
  await expect(section.getByText(/PRINT AT 100% \/ ACTUAL SIZE/)).toBeVisible();
  await expect(section.getByText(/wraps around the branch OD · developed length 279.288 mm/)).toBeVisible();
  await expect(page.locator('#elbow-pdf-format')).toHaveValue('A4');
  await expect(page.getByTestId('elbow-cut-pages')).toHaveAttribute('data-pages', '1');
});

test('paper format changes only pagination, never the geometry', async ({ page }) => {
  await openElbow(page);
  await page.getByRole('button', { name: 'TOP · top' }).click();
  const pages = page.getByTestId('elbow-cut-pages');
  await expect(pages).toHaveAttribute('data-pages', '2');
  await expect(pages).toHaveAttribute('data-pages-x', '1');
  await expect(pages).toHaveAttribute('data-pages-y', '2');
  const circumferenceA4 = await pages.getAttribute('data-circumference-mm');
  await page.locator('#elbow-pdf-format').selectOption('A3');
  await expect(pages).toHaveAttribute('data-pages', '1');
  await expect(pages).toHaveAttribute('data-circumference-mm', circumferenceA4!);
  /* Numeric results (U1) are unaffected by the paper selector. */
  await expect(page.getByTestId('elbow-physical-station').first()).toContainText('196.49 mm');
  await expect(page.getByTestId('elbow-results').getByText('Cota X′', { exact: true }).locator('..')).toContainText('41.34 mm');
});

test('cut template download is a PDF with the selected physical MediaBox and 1 page for EJE A4', async ({ page }) => {
  await openElbow(page);
  const { name, text } = await downloadPdf(page, 'elbow-download-cut');
  expect(name).toMatch(/^pipingbox-tubo-codo-3-sch40-on-6-eje-A4-cut-template-1to1\.pdf$/);
  expect(text.startsWith('%PDF-1.')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const boxes = mediaBoxes(text);
  expect(boxes).toHaveLength(1);
  expect(Math.abs(boxes[0][2] - 297 * MM2PT)).toBeLessThan(0.01);
  expect(Math.abs(boxes[0][3] - 210 * MM2PT)).toBeLessThan(0.01);
  expect(text).toContain('PRINT AT 100% / ACTUAL SIZE');
  expect(text).toContain('cut reference = branch OD');
});

test('marking guide download is a PDF that never claims to be a 1:1 hole template', async ({ page }) => {
  await openElbow(page);
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.locator('#elbow-pdf-format').selectOption('A3');
  const { name, text } = await downloadPdf(page, 'elbow-download-guide');
  expect(name).toMatch(/fe20-A3-elbow-marking-guide\.pdf$/);
  const boxes = mediaBoxes(text);
  expect(boxes.length).toBeGreaterThanOrEqual(1);
  expect(Math.abs(boxes[0][2] - 420 * MM2PT)).toBeLessThan(0.01);
  expect(Math.abs(boxes[0][3] - 297 * MM2PT)).toBeLessThan(0.01);
  expect(text).toContain('not a 1:1 hole template');
  expect(text).toContain('hole reference = branch ID');
});

test('invalid geometry hides the fabrication actions', async ({ page }) => {
  await openElbow(page);
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.locator('#elbow-fe').fill('500');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('elbow-fabrication')).toHaveCount(0);
});

test('tube → tube fabrication actions are unchanged and separate', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print picaje template 1:1' })).toBeVisible();
  await expect(page.locator('#pdf-format-select')).toHaveValue('A4');
  await expect(page.getByTestId('elbow-fabrication')).toHaveCount(0);
});

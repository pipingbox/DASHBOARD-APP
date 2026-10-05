import { expect, test } from '@playwright/test';

/* PB-BRANCH-INJERTO-EXPANSION-001 U5.4 — fabrication outputs for CODO → TUBO.
   The receiver (cylinder) gets a true PICAJE TEMPLATE 1:1; the elbow (torus)
   gets a MARKING GUIDE that never claims to be a flat 1:1 cut template. The
   paper selector changes only pagination; Cota Y' changes only annotation. */

const TOOL_URL = '/tools?t=branch-layout&lng=en';
const FAMILY = 'Elbow → tube';
const MM2PT = 72 / 25.4;
type Page = import('@playwright/test').Page;

async function openElbowOnPipe(page: Page) {
  await page.goto(TOOL_URL);
  const betaDialog = page.getByRole('dialog', { name: 'Beta Version' });
  if (await betaDialog.isVisible()) await betaDialog.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: FAMILY, exact: true }).click();
  await expect(page.getByTestId('elbow-on-pipe-results')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-fabrication')).toBeVisible();
}

async function downloadPdf(page: Page, testId: string) {
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
const pdfText = (pdf: string) => [...pdf.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1')).join('\n');

test('fabrication section names the two artifacts honestly and states the print policy', async ({ page }) => {
  await openElbowOnPipe(page);
  const section = page.getByTestId('elbow-on-pipe-fabrication');
  await expect(section.getByRole('button', { name: 'Download receiver picaje template 1:1 (PDF)' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Download elbow marking guide (PDF)' })).toBeVisible();
  await expect(section.getByRole('button', { name: /elbow cut template/i })).toHaveCount(0);
  await expect(section.getByText(/no 1:1 elbow cut template is produced/)).toBeVisible();
  await expect(section.getByText(/PRINT AT 100% \/ ACTUAL SIZE/)).toBeVisible();
  await expect(page.locator('#elbow-on-pipe-pdf-format')).toHaveValue('A4');
  await expect(page.getByTestId('elbow-on-pipe-receiver-pages')).toHaveAttribute('data-pages', '1');
  await expect(page.getByTestId('elbow-on-pipe-receiver-pages')).toHaveAttribute('data-crown-x-mm', '0');
  /* Raw kernel value: pi * 88.90 = 279.28758... mm (never rounded in the data attribute). */
  await expect(page.getByTestId('elbow-on-pipe-guide-pages')).toHaveAttribute('data-strip-length-mm', /^279\.2875/);
  /* The tube → elbow fabrication block is not rendered alongside. */
  await expect(page.getByTestId('elbow-fabrication')).toHaveCount(0);
});

test('paper format changes only pagination, never the geometry or the numeric results', async ({ page }) => {
  await openElbowOnPipe(page);
  const pages = page.getByTestId('elbow-on-pipe-receiver-pages');
  const widthA4 = await pages.getAttribute('data-width-mm');
  const heightA4 = await pages.getAttribute('data-height-mm');
  const cotaX = await page.getByTestId('elbow-on-pipe-results').getByText('Cota X′', { exact: true }).locator('..').textContent();
  await page.locator('#elbow-on-pipe-pdf-format').selectOption('A2');
  await expect(pages).toHaveAttribute('data-pages', '1');
  await expect(pages).toHaveAttribute('data-width-mm', widthA4!);
  await expect(pages).toHaveAttribute('data-height-mm', heightA4!);
  await expect(page.getByTestId('elbow-on-pipe-results').getByText('Cota X′', { exact: true }).locator('..')).toHaveText(cotaX!);
  await expect(page.getByTestId('elbow-on-pipe-row').first()).toContainText('-19.16');
});

test("Cota Y' changes only the annotation: receiver contour and strip stay byte-identical in mm", async ({ page }) => {
  await openElbowOnPipe(page);
  const pages = page.getByTestId('elbow-on-pipe-receiver-pages');
  const before = {
    w: await pages.getAttribute('data-width-mm'), h: await pages.getAttribute('data-height-mm'),
    crown: await pages.getAttribute('data-crown-x-mm'), n: await pages.getAttribute('data-pages'),
    strip: await page.getByTestId('elbow-on-pipe-guide-pages').getAttribute('data-strip-length-mm'),
  };
  await page.getByLabel('Cota Y′ · positioning reference (mm)').fill('100');
  await expect(pages).toHaveAttribute('data-width-mm', before.w!);
  await expect(pages).toHaveAttribute('data-height-mm', before.h!);
  await expect(pages).toHaveAttribute('data-crown-x-mm', before.crown!);
  await expect(pages).toHaveAttribute('data-pages', before.n!);
  await expect(page.getByTestId('elbow-on-pipe-guide-pages')).toHaveAttribute('data-strip-length-mm', before.strip!);
  const { text } = await downloadPdf(page, 'elbow-on-pipe-download-receiver');
  const txt = pdfText(text);
  expect(txt).toContain("Cota Y' = 100 mm");
  expect(txt).toContain('never changes the contour');
});

test('receiver template download is a 1:1 PDF with the selected MediaBox and the Cota X\' crown reference', async ({ page }) => {
  await openElbowOnPipe(page);
  await page.getByRole('button', { name: 'BOP · bottom' }).click();
  const { name, text } = await downloadPdf(page, 'elbow-on-pipe-download-receiver');
  expect(name).toMatch(/^pipingbox-codo-tubo-3-sch40-on-6-bop-A4-receiver-picaje-template-1to1\.pdf$/);
  expect(text.startsWith('%PDF-1.')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const boxes = mediaBoxes(text);
  expect(boxes).toHaveLength(1);
  expect(Math.abs(boxes[0][2] - 297 * MM2PT)).toBeLessThan(0.01);
  expect(Math.abs(boxes[0][3] - 210 * MM2PT)).toBeLessThan(0.01);
  const txt = pdfText(text);
  expect(txt).toContain('PICAJE TEMPLATE 1:1 - RECEIVER TUBE');
  expect(txt).toContain('PRINT AT 100% / ACTUAL SIZE');
  expect(txt).toContain('hole reference = elbow ID');
  expect(txt).toContain("Cota X' = 41.343 mm");
  expect(txt).not.toContain('?');
  expect(txt).not.toContain('MARKING GUIDE');
});

test('marking guide download never claims to be a flat 1:1 elbow cut template', async ({ page }) => {
  await openElbowOnPipe(page);
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.locator('#elbow-on-pipe-pdf-format').selectOption('A3');
  const { name, text } = await downloadPdf(page, 'elbow-on-pipe-download-guide');
  /* Fe = +20 is measured towards -X in this family, so the kernel datum offset (and the slug) is -20. */
  expect(name).toMatch(/^pipingbox-codo-tubo-3-sch40-on-6-fe-20-A3-elbow-marking-guide\.pdf$/);
  const boxes = mediaBoxes(text);
  expect(boxes.length).toBeGreaterThanOrEqual(1);
  expect(Math.abs(boxes[0][2] - 420 * MM2PT)).toBeLessThan(0.01);
  expect(Math.abs(boxes[0][3] - 297 * MM2PT)).toBeLessThan(0.01);
  const txt = pdfText(text);
  expect(txt).toContain('ELBOW MARKING GUIDE');
  expect(txt).toContain('NOT A 1:1 FLAT CUT TEMPLATE');
  expect(txt).toContain('OD DIVISION STRIP 1:1');
  expect(txt).toContain('SCHEMATIC - NOT TO SCALE');
  expect(txt).toContain('elbow cut reference = elbow OD');
  expect(txt).toContain('90 END');
  expect(txt.toUpperCase()).not.toContain('ELBOW CUT TEMPLATE 1:1');
  expect(txt.toUpperCase()).not.toContain('TORUS DEVELOPMENT');
  expect(txt).not.toContain('?');
});

test('invalid geometry hides the fabrication actions', async ({ page }) => {
  await openElbowOnPipe(page);
  await page.getByRole('button', { name: 'COTA Fe' }).click();
  await page.getByLabel('Signed Fe (mm)').fill('500');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-fabrication')).toHaveCount(0);
});

test('tube → tube and tube → elbow fabrication actions are unchanged', async ({ page }) => {
  await page.goto(TOOL_URL);
  const betaDialog = page.getByRole('dialog', { name: 'Beta Version' });
  if (await betaDialog.isVisible()) await betaDialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Print Template 1:1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print picaje template 1:1' })).toBeVisible();
  await expect(page.locator('#pdf-format-select')).toHaveValue('A4');
  await expect(page.getByTestId('elbow-on-pipe-fabrication')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tube → elbow', exact: true }).click();
  await expect(page.getByTestId('elbow-fabrication')).toBeVisible();
  await expect(page.getByTestId('elbow-on-pipe-fabrication')).toHaveCount(0);
});

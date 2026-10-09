import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * PB-PIPE-COMB-CORRECTION-001 — P3-C
 * Fabrication drawing view + real PDF export from the application.
 *
 * The PDF assertions inspect the REAL downloaded file (magic bytes and
 * non-trivial size). Text-content assertions go through
 * scripts/extract-pdf-text.mjs (pdfjs-dist): the exporter embeds Noto
 * Sans, so the document text is CID-hex-encoded and NOT searchable in the
 * raw latin1 bytes. The full text-extraction / rasterization verification
 * of the same exporter lives in scripts/test-pipe-comb-fab-pdf.ts (Node
 * runner, 190 checks). Values come from the FROZEN 3x35° P3-A acceptance
 * fixture, never recomputed here.
 */

const TOOL_URL = '/tools?t=pipe-comb&lng=en';
const TOOL_URL_ES = '/tools?t=pipe-comb&lng=es';

/** Extract searchable text from a downloaded PDF via the Node helper. */
function pdfText(buf: Buffer): string {
  const tmp = path.join(os.tmpdir(), `p3c-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmp, buf);
  try {
    const out = execFileSync(
      'node',
      [path.resolve(process.cwd(), 'scripts', 'extract-pdf-text.mjs'), tmp],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return (JSON.parse(out) as { text: string }).text;
  } finally {
    fs.unlinkSync(tmp);
  }
}

/** Count degenerate zero-length "move+line" ops in a real PDF content
 *  stream (the old g=0 joint ticks collapsed to nothing). jsPDF writes
 *  uncompressed streams with newline-separated path operators. */
function zeroLengthLineOps(buf: Buffer): number {
  const raw = buf.toString('latin1');
  const re = /(-?[\d.]+) (-?[\d.]+) m\s+(-?[\d.]+) (-?[\d.]+) l/g;
  let m: RegExpExecArray | null;
  let zero = 0;
  while ((m = re.exec(raw)) !== null) {
    if (Math.abs(Number(m[3]) - Number(m[1])) < 1e-9 && Math.abs(Number(m[4]) - Number(m[2])) < 1e-9) zero++;
  }
  return zero;
}

async function openTool(page: import('@playwright/test').Page, url: string = TOOL_URL) {
  await page.goto(url);
  const betaDialog = page.locator('div[role="dialog"][data-state="open"]');
  const shown = await betaDialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (shown) {
    await betaDialog.getByRole('button', { name: /continuar|continue/i }).click();
    await betaDialog.waitFor({ state: 'hidden' });
  }
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

/** Configure the complete 3x35° acceptance case (en, mm unless noted). */
async function setupCase3x35(page: import('@playwright/test').Page, url: string = TOOL_URL) {
  await openTool(page, url);
  await setValues(page, { count: '3', di: '250', df: '350', angle: '35' });
  await page.locator('[data-testid="pipe-comb-fab-toggle"]').click();
  await page.locator('#pipe-comb-fab-nps').selectOption('6');
  await page.locator('#pipe-comb-fab-lin').fill('1000');
  await page.locator('#pipe-comb-fab-lout').fill('1200');
}

function fabStatus(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="pipe-comb-fab-status"]');
}

/* ------------------------------------------------------------------ *
 * 1. Drawing view: same model as the PDF, real values on labels
 * ------------------------------------------------------------------ */

test('p3c-01: drawing view renders pieces, references, E points and real dimensions', async ({ page }) => {
  await setupCase3x35(page);
  const view = page.locator('[data-testid="pipe-comb-fab-drawing"]');
  await expect(view).toBeVisible();
  /* Reference planes and theoretical axis intersections. */
  await expect(page.locator('[data-testid="fab-draw-REF-ENT"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="fab-draw-REF-SAL"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="fab-draw-E1"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="fab-draw-E3"]')).toHaveCount(1);
  /* Six pup segments + three elbow arcs. */
  await expect(page.locator('[data-testid="fab-draw-seg-P1-IN"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="fab-draw-seg-P3-OUT"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="fab-draw-arc-P1-ELBOW"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="fab-draw-arc-P3-ELBOW"]')).toHaveCount(1);
  /* Dimensions carry the REAL model values (data-value-mm), not pixels. */
  const lin = page.locator('[data-testid="fab-draw-dim-dim-Lin"]');
  await expect(lin).toHaveAttribute('data-value-mm', '1000');
  await expect(lin).toContainText('1000 mm');
  const di = page.locator('[data-testid="fab-draw-dim-dim-Di"]');
  await expect(di).toHaveAttribute('data-value-mm', '250');
  /* Pup finished-length dimension: frozen fixture value. */
  const p1in = page.locator('[data-testid="fab-draw-dim-dim-P1-IN-finished-length"]');
  await expect(p1in).toHaveAttribute('data-value-mm', /^927\.92269/);
  await expect(p1in).toContainText('927.92 mm');
  /* Do-not-scale note always visible. */
  await expect(page.locator('[data-testid="pipe-comb-fab-drawing-note"]')).toContainText('Do not scale the drawing');
});

test('p3c-02: drawing view follows the unit toggle without changing the model', async ({ page }) => {
  await setupCase3x35(page);
  await page.getByRole('button', { name: 'in', exact: true }).click();
  /* Same physical value, inch presentation: 1000 mm = 39.3701 in. */
  const lin = page.locator('[data-testid="fab-draw-dim-dim-Lin"]');
  await expect(lin).toHaveAttribute('data-value-mm', '1000');
  await expect(lin).toContainText('39.3701 in');
  const p1in = page.locator('[data-testid="fab-draw-dim-dim-P1-IN-finished-length"]');
  await expect(p1in).toHaveAttribute('data-value-mm', /^927\.92269/);
  await expect(p1in).toContainText('36.5324 in');
});

test('p3c-03: bend mode draws one continuous bar per pipe (straights + arc)', async ({ page }) => {
  await setupCase3x35(page);
  await page.locator('[data-testid="pipe-comb-fab-mode-bend"]').click();
  await page.locator('#pipe-comb-fab-clr').fill('228.6');
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'complete');
  /* One bent bar per pipe: no separate elbow arcs, no joint markers. */
  await expect(page.locator('[data-testid="fab-draw-arc-P1-BEND"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="fab-draw-joint-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="fab-draw-seg-P1-IN"]')).toHaveCount(0);
});

test('p3c-04: joints with g > 0 show two distinct face ticks', async ({ page }) => {
  await setupCase3x35(page);
  await page.locator('#pipe-comb-fab-gap').fill('2');
  const joint = page.locator('[data-testid="fab-draw-joint-J1-IN"]');
  await expect(joint).toHaveAttribute('data-gap', '2');
  /* Two ticks (own face + elbow face) when the gap is positive. */
  await expect(joint.locator('line')).toHaveCount(2);
  /* g = 0 collapses to the single shared face tick. */
  await page.locator('#pipe-comb-fab-gap').fill('0');
  await expect(page.locator('[data-testid="fab-draw-joint-J1-IN"] line')).toHaveCount(1);
});

/* ------------------------------------------------------------------ *
 * 1b. Joint tick geometry: orientation from the joint's LOCAL AXIS
 *     (PDF parity). With g = 0 the two faces coincide, so deriving the
 *     tick direction from b-a degenerates to a zero-length line; the
 *     rendered segment itself is inspected (attributes, real geometry).
 * ------------------------------------------------------------------ */

interface LineAttrs { x1: number; y1: number; x2: number; y2: number }

async function lineAttrs(page: import('@playwright/test').Page, selector: string): Promise<LineAttrs> {
  const el = page.locator(selector);
  const g = (n: 'x1' | 'y1' | 'x2' | 'y2') => el.getAttribute(n);
  return { x1: Number(await g('x1')), y1: Number(await g('y1')), x2: Number(await g('x2')), y2: Number(await g('y2')) };
}

/** A tick is valid when non-degenerate and perpendicular (|cos| < 0.02)
 * to the run segment it marks. */
function assertTickPerpendicular(tick: LineAttrs, run: LineAttrs): void {
  const tv = { x: tick.x2 - tick.x1, y: tick.y2 - tick.y1 };
  const rv = { x: run.x2 - run.x1, y: run.y2 - run.y1 };
  const tl = Math.hypot(tv.x, tv.y);
  expect(tl).toBeGreaterThan(1);
  const cos = Math.abs(tv.x * rv.x + tv.y * rv.y) / (tl * Math.hypot(rv.x, rv.y));
  expect(cos).toBeLessThan(0.02);
}

test('p3c-05: g=0 joint ticks are non-degenerate and axis-oriented (35°, in/out)', async ({ page }) => {
  await setupCase3x35(page); // g = 0
  await expect(page.locator('[data-testid="fab-draw-joint-J1-IN"] line')).toHaveCount(1);
  /* Inlet joint: tick perpendicular to the P1-IN run (inlet axis). */
  assertTickPerpendicular(
    await lineAttrs(page, '[data-testid="fab-draw-joint-J1-IN"] line'),
    await lineAttrs(page, '[data-testid="fab-draw-seg-P1-IN"]'),
  );
  /* Outlet joint: tick perpendicular to the P1-OUT run (outlet axis). */
  assertTickPerpendicular(
    await lineAttrs(page, '[data-testid="fab-draw-joint-J1-OUT"] line'),
    await lineAttrs(page, '[data-testid="fab-draw-seg-P1-OUT"]'),
  );
  /* A middle pipe's joints too (P2). */
  assertTickPerpendicular(
    await lineAttrs(page, '[data-testid="fab-draw-joint-J2-IN"] line'),
    await lineAttrs(page, '[data-testid="fab-draw-seg-P2-IN"]'),
  );
});

test('p3c-06: g=2 keeps two non-degenerate face ticks (35°), axis-oriented at 90°', async ({ page }) => {
  await setupCase3x35(page);
  await page.locator('#pipe-comb-fab-gap').fill('2');
  const j1in = page.locator('[data-testid="fab-draw-joint-J1-IN"]');
  await expect(j1in.locator('line')).toHaveCount(2);
  /* Both faces carry their own non-degenerate, run-perpendicular tick. */
  const ticks = j1in.locator('line');
  const run = await lineAttrs(page, '[data-testid="fab-draw-seg-P1-IN"]');
  assertTickPerpendicular(await lineAttrs(page, '[data-testid="fab-draw-joint-J1-IN"] line:nth-child(1)'), run);
  assertTickPerpendicular(await lineAttrs(page, '[data-testid="fab-draw-joint-J1-IN"] line:nth-child(2)'), run);
  /* The two ticks sit on DIFFERENT faces (J1 carries the real gap) and
   * their midpoints differ by the true scaled separation: 2 mm at whole-
   * comb view scale is sub-pixel (~0.6 px here), so the threshold is the
   * distinct-face epsilon, not a legibility one. */
  await expect(j1in).toHaveAttribute('data-gap', '2');
  const mid = (l: LineAttrs) => ({ x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 });
  const m1 = mid(await lineAttrs(page, '[data-testid="fab-draw-joint-J1-IN"] line:nth-child(1)'));
  const m2 = mid(await lineAttrs(page, '[data-testid="fab-draw-joint-J1-IN"] line:nth-child(2)'));
  expect(Math.hypot(m2.x - m1.x, m2.y - m1.y)).toBeGreaterThan(0.3);
  /* 90° case, g = 0: the outlet axis is perpendicular to the inlet one,
   * still non-degenerate and perpendicular to its own run. */
  await page.locator('#pipe-comb-fab-gap').fill('0');
  await setValues(page, { angle: '90' });
  await expect(page.locator('[data-testid="fab-draw-joint-J1-IN"] line')).toHaveCount(1);
  assertTickPerpendicular(
    await lineAttrs(page, '[data-testid="fab-draw-joint-J1-IN"] line'),
    await lineAttrs(page, '[data-testid="fab-draw-seg-P1-IN"]'),
  );
  assertTickPerpendicular(
    await lineAttrs(page, '[data-testid="fab-draw-joint-J1-OUT"] line'),
    await lineAttrs(page, '[data-testid="fab-draw-seg-P1-OUT"]'),
  );
});

/* ------------------------------------------------------------------ *
 * 2. Export gating (spec §6): blocked states never reuse stale data
 * ------------------------------------------------------------------ */

test('p3c-10: export enabled on the complete 3x35 case with A4 default', async ({ page }) => {
  await setupCase3x35(page);
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'complete-warnings');
  const btn = page.locator('[data-testid="pipe-comb-fab-export-pdf"]');
  await expect(btn).toBeEnabled();
  await expect(page.locator('[data-testid="pipe-comb-fab-paper-a4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="pipe-comb-fab-export-blocked"]')).toHaveCount(0);
});

test('p3c-11: pending references block the export with the concrete reason', async ({ page }) => {
  await setupCase3x35(page);
  await page.locator('#pipe-comb-fab-lin').fill('');
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'pending-refs');
  const btn = page.locator('[data-testid="pipe-comb-fab-export-pdf"]');
  await expect(btn).toBeDisabled();
  const blocked = page.locator('[data-testid="pipe-comb-fab-export-blocked"]');
  await expect(blocked).toBeVisible();
  expect(await blocked.textContent()).toContain('Complete the references');
});

test('p3c-12: invalid text blocks the export; a stale valid plan is never reused', async ({ page }) => {
  await setupCase3x35(page);
  const btn = page.locator('[data-testid="pipe-comb-fab-export-pdf"]');
  await expect(btn).toBeEnabled();
  /* Invalidate Lin AFTER a valid plan existed: the export control must
     not stay actionably enabled. In review state there is no solution, so
     the whole export block is hidden (nothing stale to export) and the
     concrete reason is shown by the status/review lines. */
  await page.locator('#pipe-comb-fab-lin').fill('abc');
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'review');
  await expect(page.locator('[data-testid="pipe-comb-fab-export-pdf"]')).toHaveCount(0);
  expect(await page.locator('[data-testid="pipe-comb-fab-review-reason"]').textContent()).toContain('Lin');
  /* Recovery re-enables. */
  await page.locator('#pipe-comb-fab-lin').fill('1000');
  await expect(btn).toBeEnabled();
});

test('p3c-13: invalid plan (negative pup) blocks the export', async ({ page }) => {
  await setupCase3x35(page);
  /* Tiny Lin makes P3-IN negative -> invalid plan. */
  await page.locator('#pipe-comb-fab-lin').fill('100');
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'invalid-plan');
  await expect(page.locator('[data-testid="pipe-comb-fab-export-pdf"]')).toBeDisabled();
  await expect(page.locator('[data-testid="pipe-comb-fab-export-blocked"]')).toBeVisible();
});

test('p3c-14: incompatible CLR (bend, CLR <= OD/2) blocks the export', async ({ page }) => {
  await setupCase3x35(page);
  await page.locator('[data-testid="pipe-comb-fab-mode-bend"]').click();
  await page.locator('#pipe-comb-fab-clr').fill('84.14');
  /* CLR = OD/2: the module solves but the geometry is not constructible
     (invalid plan), and the export stays disabled with the reason shown. */
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'invalid-plan');
  await expect(page.locator('[data-testid="pipe-comb-fab-export-pdf"]')).toBeDisabled();
  await expect(page.locator('[data-testid="pipe-comb-fab-export-blocked"]')).toBeVisible();
});

/* ------------------------------------------------------------------ *
 * 3. Real PDF download from the application
 * ------------------------------------------------------------------ */

test('p3c-20: A4 export downloads a real PDF from the app', async ({ page }) => {
  await setupCase3x35(page);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^pipe-comb-fabrication-PBC-.*\.pdf$/);
  const path = await download.path();
  const buf = fs.readFileSync(path);
  /* Real PDF magic bytes and a non-trivial multi-page document. */
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(20_000);
  /* A4 landscape MediaBox (~841.89 x ~595.28 pt). */
  expect(buf.toString('latin1')).toMatch(/MediaBox \[0 0 841\.8/);
  /* g = 0 joint markers use the joint's local axis: no degenerate
   * zero-length strokes in the real downloaded file. */
  expect(zeroLengthLineOps(buf)).toBe(0);
});

test('p3c-21: A3 export downloads a real PDF after switching the format', async ({ page }) => {
  await setupCase3x35(page);
  await page.locator('[data-testid="pipe-comb-fab-paper-a3"]').click();
  await expect(page.locator('[data-testid="pipe-comb-fab-paper-a3"]')).toHaveAttribute('aria-pressed', 'true');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click(),
  ]);
  const buf = fs.readFileSync(await download.path()).toString('latin1');
  expect(buf.slice(0, 5)).toBe('%PDF-');
  /* A3 pages are ~1190.55 x ~841.89 pt: the MediaBox must appear. */
  expect(buf).toMatch(/MediaBox \[0 0 1190\.5/);
});

test('p3c-22: export snapshot is immutable — edits during generation never leak', async ({ page }) => {
  test.setTimeout(90_000);
  await setupCase3x35(page);
  /* Capture the download, then edit Lin IMMEDIATELY after the click is
     dispatched (the snapshot is taken synchronously at click time). The
     document must still carry the click-time plan (Lin = 1000 -> P1-IN
     927.92 mm), never the in-flight edit (500 -> 427.92). */
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click();
  await page.locator('#pipe-comb-fab-lin').fill('500');
  const download = await downloadPromise;
  const buf = fs.readFileSync(await download.path());
  /* The UI now shows the edited plan (500 mm Lin)… */
  await expect(page.locator('#pipe-comb-fab-lin')).toHaveValue('500');
  /* …but the document was generated from the click-time snapshot: the
     P1-IN cut length of the 1000 mm plan (927.92) is embedded, and the
     500 mm plan's value (427.92) is not. The embedded Noto Sans encodes
     text as CID hex, so the check runs on the EXTRACTED text. */
  const text = pdfText(buf);
  expect(text).toContain('927.92');
  expect(text).not.toContain('427.92');
});

test('p3c-23: Spanish export produces a localized real PDF', async ({ page }) => {
  await setupCase3x35(page, TOOL_URL_ES);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click(),
  ]);
  const buf = fs.readFileSync(await download.path());
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  /* Localized title-block strings, read from the extracted text (the
     embedded font encodes text as CID hex, not latin1 literals). */
  expect(pdfText(buf)).toContain('Página');
});

test('p3c-24: export from a 320 px viewport produces the same document', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await setupCase3x35(page);
  /* The PDF geometry must not depend on the mobile width. */
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click(),
  ]);
  const buf = fs.readFileSync(await download.path());
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  /* A4 landscape MediaBox (~841.89 x ~595.28 pt) regardless of viewport. */
  expect(buf.toString('latin1')).toMatch(/MediaBox \[0 0 841\.8/);
  /* Same cut values as the desktop export (extracted text: CID font). */
  expect(pdfText(buf)).toContain('927.92');
});

test('p3c-25: English/inches bend case (CLR 9 in) exports a valid PDF', async ({ page }) => {
  await setupCase3x35(page);
  await page.getByRole('button', { name: 'in', exact: true }).click();
  await page.locator('[data-testid="pipe-comb-fab-mode-bend"]').click();
  await page.locator('#pipe-comb-fab-clr').fill('9');
  await expect(fabStatus(page)).toHaveAttribute('data-status', 'complete');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click(),
  ]);
  const buf = fs.readFileSync(await download.path());
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  /* Inch presentation inside the document (CLR 9 in = 228.6 mm), read
     from the extracted text (CID-hex font encoding). */
  expect(pdfText(buf)).toContain('9 in');
});

test('p3c-26: dense assembly (N=7) exports per-group detail views covering every pipe', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page);
  await setValues(page, { count: '7', di: '250', df: '350', angle: '35' });
  await page.locator('[data-testid="pipe-comb-fab-toggle"]').click();
  await page.locator('#pipe-comb-fab-nps').selectOption('6');
  /* Long enough references: with A = 253.17 mm, pipe 7's inlet pup needs
   * Lin > t + 6·A (same valid reference set as the N=12 runner case). */
  await page.locator('#pipe-comb-fab-lin').fill('5000');
  await page.locator('#pipe-comb-fab-lout').fill('2000');
  /* Export stays enabled with warnings (N=7 stagger/contact notices). */
  await expect(fabStatus(page)).toHaveAttribute('data-status', /^complete/);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.locator('[data-testid="pipe-comb-fab-export-pdf"]').click(),
  ]);
  const buf = fs.readFileSync(await download.path());
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(zeroLengthLineOps(buf)).toBe(0);
  const text = pdfText(buf).replace(/\s+/g, ' ');
  /* The density threshold no longer drops per-piece data: detail views
   * exist and every piece (including the last single-pipe group) appears
   * in the cut list AND in a drawn view. */
  expect(text.split('Detail view').length - 1).toBeGreaterThanOrEqual(3);
  for (const id of ['P1-IN', 'P4-OUT', 'P7-IN', 'P7-OUT', 'P7-ELBOW']) {
    expect(text.split(id).length - 1).toBeGreaterThanOrEqual(2);
  }
  /* Global dimensions survive as real dimension lines in the overview. */
  expect(text).toContain('Di = 250');
  expect(text).toContain('Df = 350');
});

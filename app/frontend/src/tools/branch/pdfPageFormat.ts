/* ───────────────────────────────────────────────────────────────────────────
   Single source of truth for physical PDF page formats
   (PB-BRANCH-PRINT-FORMATS-001).

   Both 1:1 template generators (cut + picaje) and the tests consume this
   definition — page geometry must never be duplicated per generator.

   All formats are LANDSCAPE for V1. The safe margin is the assumed printer
   border; the usable area is what remains inside it. Changing the paper
   only changes the available physical area (and therefore the tiling):
   the fabrication geometry is ALWAYS 1:1 and never rescaled.
   ─────────────────────────────────────────────────────────────────────────── */

export type PdfPageFormatId = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';

export interface PdfPageFormat {
  id: PdfPageFormatId;
  /** Landscape page width — mm. */
  widthMm: number;
  /** Landscape page height — mm. */
  heightMm: number;
  orientation: 'landscape';
  /** Safe printable border on every side — mm. */
  safeMarginMm: number;
}

/** ISO A series, landscape. Order: smallest → largest. */
export const PDF_PAGE_FORMATS: readonly PdfPageFormat[] = [
  { id: 'A4', widthMm: 297, heightMm: 210, orientation: 'landscape', safeMarginMm: 5 },
  { id: 'A3', widthMm: 420, heightMm: 297, orientation: 'landscape', safeMarginMm: 5 },
  { id: 'A2', widthMm: 594, heightMm: 420, orientation: 'landscape', safeMarginMm: 5 },
  { id: 'A1', widthMm: 841, heightMm: 594, orientation: 'landscape', safeMarginMm: 5 },
  { id: 'A0', widthMm: 1189, heightMm: 841, orientation: 'landscape', safeMarginMm: 5 },
];

export const DEFAULT_PDF_PAGE_FORMAT_ID: PdfPageFormatId = 'A4';

export function getPdfPageFormat(id: PdfPageFormatId = DEFAULT_PDF_PAGE_FORMAT_ID): PdfPageFormat {
  const def = PDF_PAGE_FORMATS.find(f => f.id === id);
  if (!def) throw new Error(`Unknown PDF page format: ${id}`);
  return def;
}

/** Usable printable width inside the safe border — mm. */
export const pdfFormatUsableWidthMm = (f: PdfPageFormat): number =>
  f.widthMm - 2 * f.safeMarginMm;

/** Usable printable height inside the safe border — mm. */
export const pdfFormatUsableHeightMm = (f: PdfPageFormat): number =>
  f.heightMm - 2 * f.safeMarginMm;

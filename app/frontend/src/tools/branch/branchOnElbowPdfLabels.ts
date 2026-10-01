/* ───────────────────────────────────────────────────────────────────────────
   TUBO→CODO — PDF-safe label sets for the physical fabrication artifacts
   (PB-BRANCH-INJERTO-EXPANSION-001 U4 glyph hotfix).

   Presentation only: no geometry, no page maths. It exists because screen text
   and PDF text are not interchangeable. svgMmToPdf writes base-14 Courier with
   WinAnsiEncoding, so any codepoint above Latin-1 that it cannot transliterate
   becomes '?' in the printed sheet — unacceptable on a workshop document.

   Two defences, in this order:
   1. ASCII folding of the typographic characters the UI legitimately uses but
      the PDF cannot encode (prime ′, minus −, ellipsis …, curly quotes) and of
      the Greek origin glyph Ω, which becomes the explicit fabrication label
      REF O on the sheet;
   2. if any localized label still fails pdfLatin1Safe (bg/uk Cyrillic, pl/ro
      Latin-2), the whole set falls back to the built-in ASCII English one —
      same wholesale policy as the H-001 tube→tube artifacts, so a sheet is
      never half-translated.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchOnElbowTemplateMeta } from './branchOnElbowTemplateSvg';
import type { BranchOnElbowMarkingGuideMeta } from './branchOnElbowMarkingGuideSvg';
import { pdfLatin1Safe } from './svgMmToPdf.ts';

/** Explicit reference-origin label printed on the sheets (never the Ω glyph). */
export const PDF_ORIGIN_LABEL = 'REF O';
/** Literal print instruction required on every physical page. */
export const PDF_PRINT_AT_ACTUAL_SIZE = 'PRINT AT 100% / ACTUAL SIZE';

/** Typographic → PDF-safe folding applied to every label before encoding. */
const FOLD: Record<string, string> = {
  'Ω': PDF_ORIGIN_LABEL, 'ω': PDF_ORIGIN_LABEL,
  '′': "'", '″': '"', '‵': "'",
  '−': '-', '‒': '-', '―': '-', '‐': '-', '‑': '-',
  '…': '...', '∥': 'parallel to', '⊥': 'perpendicular to',
  '≠': '!=', '∞': 'inf', '⌀': 'dia ', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ',
};

/** Fold PDF-hostile typography, then report whether the result is encodable. */
export function pdfSafeLabel(value: string): string {
  let out = '';
  for (const ch of value) out += FOLD[ch] ?? ch;
  return out;
}

/** True when the folded label survives the PDF writer without '?' substitution. */
export function pdfLabelEncodable(value: string): boolean {
  return pdfLatin1Safe(pdfSafeLabel(value));
}

/** ASCII English fallback texts (mirror of the en locale, ASCII only). */
const EN = {
  cutTitle: 'CUT TEMPLATE 1:1 - BRANCH TUBE (tube -> elbow)',
  guideTitle: 'ELBOW HOLE MARKING GUIDE (picaje) - tube -> elbow',
  conventionCut: 'PIPINGBOX SET-ON - cut reference = branch OD',
  conventionHole: 'PIPINGBOX SET-ON - hole reference = branch ID',
  guideNote: 'MARKING GUIDE - not a 1:1 hole template. Only the ring strip is 1:1.',
  stripTitle: `RING STRIP 1:1 - wrap square around the elbow at the ${PDF_ORIGIN_LABEL} ring`,
  bendPlane: "X'=0 bend plane",
  towardTop: 'toward TOP',
  towardBop: 'toward BOP',
  endA: 'end A (elbow face parallel to the branch axis)',
  endB: 'end B (elbow face perpendicular to the branch axis)',
  colRing: 'ring mm',
  colDir: 'dir',
  colInj: 'inj. mm',
  steps: [
    `Mark end B and measure Cota Y' along the elbow to locate the ${PDF_ORIGIN_LABEL} ring.`,
    "Wrap the strip square around the elbow at that ring; align X'=0 with the bend plane.",
    'Transfer every P mark from the strip onto the elbow.',
    'From each P mark measure Y along the elbow at constant clock position: toward end B (+Y) or end A (-Y).',
    'Join the transferred points: this is the hole contour (branch ID).',
  ],
  schematicTitle: 'SCHEMATIC',
  notToScale: 'NOT TO SCALE',
  section: 'Ring section',
  elevation: 'Elevation',
  cotaX: "Cota X'",
  cotaY: "Cota Y'",
  seam: 'Seam',
  page: 'Page',
  overlap: 'Overlap',
  baseline: 'Baseline = min injerto from the square-cut end',
  injerto: 'injerto (mm) = distance from the square-cut end',
  wrapNote: 'Wrap around the branch OD; align the seam with station 1.',
  calibrationCut: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE CUTTING',
  calibrationGuide: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING',
} as const;

export interface BranchOnElbowPdfLabelInputs {
  /** i18n lookup for `tools.*` keys. */
  translate: (key: string) => string;
  /** Resolved datum text, e.g. "TOP" or "COTA Fe = +20 mm". */
  datumLabel: string;
  /** e.g. '3" Sch 40 · OD 88.9 mm · ID 77.92 mm'. */
  branchLabel: string;
  /** e.g. '6" · D 168.3 mm · R 228.6 mm · L 200 mm · a 150 mm'. */
  elbowLabel: string;
}

export interface BranchOnElbowPdfLabels {
  cut: BranchOnElbowTemplateMeta;
  guide: BranchOnElbowMarkingGuideMeta;
  /** False when the locale is not PDF-encodable and the ASCII English set was used. */
  localized: boolean;
}

/** Build both PDF-safe label sets; never yields a label the PDF writer mangles. */
export function buildBranchOnElbowPdfLabels(inputs: BranchOnElbowPdfLabelInputs): BranchOnElbowPdfLabels {
  const { translate } = inputs;
  const tr = (key: string) => pdfSafeLabel(translate(`tools.branchOnElbow.${key}`));
  const trLayout = (key: string) => pdfSafeLabel(translate(`tools.branchLayout.${key}`));
  const steps = [1, 2, 3, 4, 5].map(step => tr(`guideStep${step}`));
  const localizedValues = [
    tr('cutTemplateTitle'), tr('guideTitle'), tr('conventionCut'), tr('conventionHole'), tr('guideNote'),
    tr('stripTitle'), tr('bendPlane'), tr('towardTop'), tr('towardBop'), tr('endA'), tr('endB'),
    tr('colRing'), tr('colDir'), tr('colInj'), tr('schematicTitle'), tr('notToScale'),
    tr('schematicSection'), tr('schematicElevation'), tr('cotaX'), tr('cotaY'),
    tr('baselineLabel'), tr('injertoFromEnd'), tr('calibrationCut'), tr('calibrationGuide'),
    trLayout('seam'), trLayout('page'), trLayout('overlap'), trLayout('wrapNote'), ...steps,
  ];
  const localized = localizedValues.every(pdfLatin1Safe);

  /* Case-specific labels are numeric/dimensional; fold them either way. */
  const datumLabel = pdfSafeLabel(inputs.datumLabel);
  const branchLabel = pdfSafeLabel(inputs.branchLabel);
  const elbowLabel = pdfSafeLabel(inputs.elbowLabel);
  const pick = (value: string, fallback: string) => (localized ? value : fallback);

  const cut: BranchOnElbowTemplateMeta = {
    titleLabel: pick(tr('cutTemplateTitle'), EN.cutTitle),
    familyLabel: 'TUBO-CODO',
    datumLabel, branchLabel, elbowLabel,
    conventionLabel: pick(tr('conventionCut'), EN.conventionCut),
    seamLabel: pick(trLayout('seam'), EN.seam),
    pageLabel: pick(trLayout('page'), EN.page),
    overlapLabel: pick(trLayout('overlap'), EN.overlap),
    baselineLabel: pick(tr('baselineLabel'), EN.baseline),
    injertoLabel: pick(tr('injertoFromEnd'), EN.injerto),
    wrapNoteLabel: pick(trLayout('wrapNote'), EN.wrapNote),
    calibrationNote: pick(tr('calibrationCut'), EN.calibrationCut),
    printAtActualSize: PDF_PRINT_AT_ACTUAL_SIZE,
    generatedLabel: 'PIPINGBOX',
  };

  const guide: BranchOnElbowMarkingGuideMeta = {
    titleLabel: pick(tr('guideTitle'), EN.guideTitle),
    familyLabel: 'TUBO-CODO',
    datumLabel, branchLabel, elbowLabel,
    conventionLabel: pick(tr('conventionHole'), EN.conventionHole),
    guideNote: pick(tr('guideNote'), EN.guideNote),
    stripTitle: pick(tr('stripTitle'), EN.stripTitle),
    bendPlaneLabel: pick(tr('bendPlane'), EN.bendPlane),
    omegaLabel: PDF_ORIGIN_LABEL,
    towardTopLabel: pick(tr('towardTop'), EN.towardTop),
    towardBopLabel: pick(tr('towardBop'), EN.towardBop),
    endALabel: pick(tr('endA'), EN.endA),
    endBLabel: pick(tr('endB'), EN.endB),
    colStation: 'P',
    colTheta: 'θ°',
    colRing: pick(tr('colRing'), EN.colRing),
    colX: 'X mm',
    colY: 'Y mm',
    colDir: pick(tr('colDir'), EN.colDir),
    colInjerto: pick(tr('colInj'), EN.colInj),
    closureLabel: '360°',
    steps: localized ? steps : [...EN.steps],
    schematicTitle: pick(tr('schematicTitle'), EN.schematicTitle),
    notToScale: pick(tr('notToScale'), EN.notToScale),
    sectionLabel: pick(tr('schematicSection'), EN.section),
    elevationLabel: pick(tr('schematicElevation'), EN.elevation),
    cotaXLabel: pick(tr('cotaX'), EN.cotaX),
    cotaYLabel: pick(tr('cotaY'), EN.cotaY),
    pageLabel: pick(trLayout('page'), EN.page),
    overlapLabel: pick(trLayout('overlap'), EN.overlap),
    calibrationNote: pick(tr('calibrationGuide'), EN.calibrationGuide),
    printAtActualSize: PDF_PRINT_AT_ACTUAL_SIZE,
    generatedLabel: 'PIPINGBOX',
  };

  return { cut, guide, localized };
}

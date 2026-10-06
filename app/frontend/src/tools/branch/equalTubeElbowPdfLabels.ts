/* ───────────────────────────────────────────────────────────────────────────
   TUBO ⇄ CODO IGUALES — PDF-safe label layer for the U6.2 fabrication sheets.

   Screen text and PDF text are not interchangeable: the shared PDF writer
   encodes WinAnsi and prints '?' for anything else. Every label on a workshop
   sheet therefore passes through pdfSafeLabel (typographic folding) and the
   whole set falls back to an ASCII English sheet when the active locale is not
   encodable. Same contract as branchOnElbowPdfLabels (U4 §7) and
   elbowOnPipePdfLabels (U5.4).

   Terminology contract (asserted by tests):
     allowed   TUBE CUT TEMPLATE 1:1 · ELBOW MARKING GUIDE ·
               OD DIVISION STRIP 1:1 · SCHEMATIC - NOT TO SCALE
     forbidden ELBOW CUT TEMPLATE 1:1 · ELBOW FLAT TEMPLATE 1:1 · 1:1 TORUS DEVELOPMENT
   ─────────────────────────────────────────────────────────────────────────── */

import type { EqualTubeTemplateMeta } from './equalTubeElbowTemplateSvg.ts';
import type { EqualTubeGuideMeta } from './equalTubeElbowGuideSvg.ts';
import { PDF_PRINT_AT_ACTUAL_SIZE, pdfSafeLabel } from './branchOnElbowPdfLabels.ts';
import { pdfLatin1Safe } from './svgMmToPdf.ts';

/** ASCII English fallback texts (mirror of the en locale, ASCII only). */
const EN = {
  templateTitle: 'TUBE CUT TEMPLATE 1:1 (tube <-> elbow, equal)',
  guideTitle: 'ELBOW MARKING GUIDE (tube <-> elbow, equal)',
  convention: 'PIPINGBOX - tube cut contour = tube ID · elbow marking = elbow OD',
  ordinateFromEnd: 'ORDINATES = CUT-BACK FROM THE SQUARE END AT THE ELBOW SIDE. Wrap with Y=0 on that end; cut above the curve.',
  ordinateCota: 'ORDINATES = COTA TUBO, from the FAR square end (table values). Cross-check only; wrap against the elbow-side end.',
  guideNote: 'NOT A 1:1 FLAT CUT TEMPLATE - the elbow is a torus with no exact flat development. Only the OD DIVISION STRIP is 1:1.',
  stripTitle: 'OD DIVISION STRIP 1:1 - wrap square around the elbow OD at the t=0 end; P1 on the bend plane',
  colStation: 'P',
  colTheta: 'th deg',
  colArcPos: 'OD pos mm',
  colArcRadius: 'R arc mm',
  colArcLength: 'L arc mm',
  colBend: 't deg',
  colLimit: 'limit',
  limitCell: '90 END',
  schematicTitle: 'SCHEMATIC',
  notToScale: 'SCHEMATIC - NOT TO SCALE',
  section: 'Cross-section at the t=0 end',
  elevation: 'Bend-plane elevation',
  endPlane: 't=0: end plane of the elbow (reference for L arc)',
  endFace: '90: physical end face - clamped stations (t=90) end here',
  arcDirection: 'L arc measured along the bend',
  steps: [
    'Cut the tube with the TUBE CUT TEMPLATE 1:1: wrap it with Y=0 on the square end at the elbow side and cut above the curve.',
    'Wrap the OD DIVISION STRIP square around the elbow at the t=0 end; mark P1..PN on the OD.',
    'From each P mark follow the generating arc of the elbow (constant clock position, along the bend direction).',
    'Measure L arc (Longitud arco) of that station along the arc from the t=0 end plane. Stations flagged 90 END terminate on the 90 deg end face: mark the face itself.',
    'Join the marked points around the elbow: this is the cut line. Fit the cut tube against it (equal members, tube ID against elbow OD).',
  ],
  page: 'Page',
  overlap: 'Overlap',
  calibration: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING',
} as const;

export interface EqualTubeElbowPdfLabelInputs {
  translate: (key: string) => string;
  /** e.g. '3" Sch 40 · OD 88.9 mm · ID 77.92 mm · R 114.3 mm · L 300 mm'. */
  memberLabel: string;
}

export interface EqualTubeElbowPdfLabels {
  template: EqualTubeTemplateMeta;
  guide: EqualTubeGuideMeta;
  /** False when the locale is not PDF-encodable and the ASCII English set was used. */
  localized: boolean;
}

export function buildEqualTubeElbowPdfLabels(inputs: EqualTubeElbowPdfLabelInputs): EqualTubeElbowPdfLabels {
  const { translate } = inputs;
  const tr = (key: string) => pdfSafeLabel(translate(`tools.equalTubeElbow.${key}`));
  const trLayout = (key: string) => pdfSafeLabel(translate(`tools.branchLayout.${key}`));
  const steps = [1, 2, 3, 4, 5].map(step => tr(`pdfStep${step}`));
  const localizedValues = [
    tr('pdfTemplateTitle'), tr('pdfGuideTitle'), tr('pdfConvention'), tr('pdfOrdinateFromEnd'), tr('pdfOrdinateCota'),
    tr('pdfGuideNote'), tr('pdfStripTitle'), tr('pdfColTheta'), tr('pdfColArcPos'), tr('pdfColArcRadius'),
    tr('pdfColArcLength'), tr('pdfColBend'), tr('pdfColLimit'), tr('pdfLimitCell'), tr('pdfSchematicTitle'),
    tr('pdfNotToScale'), tr('pdfSection'), tr('pdfElevation'), tr('pdfEndPlane'), tr('pdfEndFace'),
    tr('pdfArcDirection'), tr('pdfCalibration'), trLayout('page'), trLayout('overlap'), ...steps,
  ];
  const localized = localizedValues.every(pdfLatin1Safe);

  const memberLabel = pdfSafeLabel(inputs.memberLabel);
  const pick = (value: string, fallback: string) => (localized ? value : fallback);
  const pickSteps = (values: string[]) => (localized ? values : EN.steps);

  const template: EqualTubeTemplateMeta = {
    titleLabel: pick(tr('pdfTemplateTitle'), EN.templateTitle),
    familyLabel: 'TUBO-CODO IGUALES',
    memberLabel: pdfSafeLabel(translate('tools.equalTubeElbow.member')),
    tubeLabel: memberLabel,
    ordinateFromEndNote: pick(tr('pdfOrdinateFromEnd'), EN.ordinateFromEnd),
    ordinateCotaNote: pick(tr('pdfOrdinateCota'), EN.ordinateCota),
    seamLabel: pick(tr('pdfSeam'), 'seam'),
    pageLabel: pick(trLayout('page'), EN.page),
    overlapLabel: pick(trLayout('overlap'), EN.overlap),
    wrapNoteLabel: pick(tr('pdfWrapNote'), 'Wrap note'),
    calibrationNote: pick(tr('pdfCalibration'), EN.calibration),
    printAtActualSize: PDF_PRINT_AT_ACTUAL_SIZE,
    generatedLabel: 'PIPINGBOX',
  };

  const guide: EqualTubeGuideMeta = {
    titleLabel: pick(tr('pdfGuideTitle'), EN.guideTitle),
    familyLabel: 'TUBO-CODO IGUALES',
    memberLabel: pdfSafeLabel(translate('tools.equalTubeElbow.elbowMember')),
    tubeLabel: memberLabel,
    conventionLabel: pick(tr('pdfConvention'), EN.convention),
    guideNote: pick(tr('pdfGuideNote'), EN.guideNote),
    stripTitle: pick(tr('pdfStripTitle'), EN.stripTitle),
    closureLabel: pick(tr('pdfClosure'), 'closure'),
    colStation: pick(tr('pdfColStation'), EN.colStation),
    colTheta: pick(tr('pdfColTheta'), EN.colTheta),
    colArcPos: pick(tr('pdfColArcPos'), EN.colArcPos),
    colArcRadius: pick(tr('pdfColArcRadius'), EN.colArcRadius),
    colArcLength: pick(tr('pdfColArcLength'), EN.colArcLength),
    colBend: pick(tr('pdfColBend'), EN.colBend),
    colLimit: pick(tr('pdfColLimit'), EN.colLimit),
    limitCell: pick(tr('pdfLimitCell'), EN.limitCell),
    schematicTitle: pick(tr('pdfSchematicTitle'), EN.schematicTitle),
    notToScale: pick(tr('pdfNotToScale'), EN.notToScale),
    sectionLabel: pick(tr('pdfSection'), EN.section),
    elevationLabel: pick(tr('pdfElevation'), EN.elevation),
    endPlaneLabel: pick(tr('pdfEndPlane'), EN.endPlane),
    endFaceLabel: pick(tr('pdfEndFace'), EN.endFace),
    arcDirectionLabel: pick(tr('pdfArcDirection'), EN.arcDirection),
    steps: pickSteps(steps),
    pageLabel: pick(trLayout('page'), EN.page),
    overlapLabel: pick(trLayout('overlap'), EN.overlap),
    calibrationNote: pick(tr('pdfCalibration'), EN.calibration),
    printAtActualSize: PDF_PRINT_AT_ACTUAL_SIZE,
    generatedLabel: 'PIPINGBOX',
  };

  return { template, guide, localized };
}

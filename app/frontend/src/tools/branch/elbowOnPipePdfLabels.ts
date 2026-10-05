/* ───────────────────────────────────────────────────────────────────────────
   CODO→TUBO — PDF-safe label layer for the U5.4 fabrication sheets.

   Screen text and PDF text are not interchangeable: the shared PDF writer
   encodes WinAnsi and prints '?' for anything else. Every label on a workshop
   sheet therefore passes through pdfSafeLabel (typographic folding) and the
   whole set falls back to an ASCII English sheet when the active locale is not
   encodable (ro/pl/bg/uk). Same contract as branchOnElbowPdfLabels (U4 §7).

   Terminology contract (asserted by tests):
     allowed   PICAJE TEMPLATE 1:1 - RECEIVER TUBE · ELBOW MARKING GUIDE ·
               OD DIVISION STRIP 1:1 · SCHEMATIC - NOT TO SCALE
     forbidden ELBOW CUT TEMPLATE 1:1 · ELBOW FLAT TEMPLATE 1:1 · 1:1 TORUS DEVELOPMENT
   ─────────────────────────────────────────────────────────────────────────── */

import type { ElbowOnPipeReceiverTemplateMeta } from './elbowOnPipeReceiverTemplateSvg';
import type { ElbowOnPipeMarkingGuideMeta } from './elbowOnPipeMarkingGuideSvg';
import { PDF_PRINT_AT_ACTUAL_SIZE, pdfSafeLabel } from './branchOnElbowPdfLabels.ts';
import { pdfLatin1Safe } from './svgMmToPdf.ts';

/** ASCII English fallback texts (mirror of the en locale, ASCII only). */
const EN = {
  receiverTitle: 'PICAJE TEMPLATE 1:1 - RECEIVER TUBE (elbow -> tube)',
  guideTitle: 'ELBOW MARKING GUIDE (elbow -> tube)',
  conventionReceiver: 'PIPINGBOX SET-ON - hole reference = elbow ID',
  conventionElbow: 'PIPINGBOX SET-ON - elbow cut reference = elbow OD',
  receiverOrigin: '(0,0) = datum generatrix x t=0 leg-axis plane. Wrap on the receiver: X along the circumference, Y along the axis.',
  receiverXAxis: 'X = arc on the receiver circumference',
  receiverYAxis: 'Y = along the receiver axis, toward the 90 deg end face',
  towardTop: 'toward TOP',
  towardBop: 'toward BOP',
  crown: 'receiver crown (top generatrix)',
  legPlane: 't=0 leg-axis plane',
  endFace: '90 deg end face (clamped stations)',
  cotaX: "Cota X'",
  cotaY: "Cota Y'",
  cotaYAbsent: 'not set',
  cotaYNote: "Y' is an external placement dimension (REF O -> origin). It never changes the contour.",
  guideNote: 'NOT A 1:1 FLAT CUT TEMPLATE - the elbow is a torus with no exact flat development. Only the OD DIVISION STRIP is 1:1.',
  stripTitle: 'OD DIVISION STRIP 1:1 - wrap square around the elbow OD at the t=0 free end; P1 on the bend plane (psi=0, extrados)',
  colStation: 'P',
  colPsi: 'psi deg',
  colArcPos: 'OD pos mm',
  colArcRadius: 'R arc mm',
  colArcLength: 'L arc mm',
  colBend: 't deg',
  colLimit: 'limit',
  limitCell: '90 END',
  schematicTitle: 'SCHEMATIC',
  notToScale: 'SCHEMATIC - NOT TO SCALE',
  section: 'Elbow cross-section at the t=0 end',
  elevation: 'Bend-plane elevation',
  endPlane: 't=0: free end plane of the elbow (reference for L arc)',
  endFaceLegend: '90: physical end face - clamped stations (t=90) end here',
  arcDirection: 'L arc measured along the bend',
  steps: [
    'Wrap the OD DIVISION STRIP square around the elbow at the t=0 free end; mark P1..PN on the OD (P1 on the bend plane at the extrados, the back of the bend).',
    'From each P mark follow the generating arc of the elbow (constant clock position, along the bend direction).',
    'Measure L arc (Longitud arco) of that station along the arc, starting at the t=0 end plane.',
    'Mark the cut point. Stations flagged 90 END terminate on the 90 deg end face: mark the face itself.',
    'Join the marked points around the elbow: this is the cut line (elbow OD, SET-ON).',
  ],
  page: 'Page',
  overlap: 'Overlap',
  calibrationReceiver: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING',
  calibrationGuide: 'VERIFY THE 100 mm CALIBRATION BAR BEFORE MARKING OR CUTTING',
} as const;

export interface ElbowOnPipePdfLabelInputs {
  translate: (key: string) => string;
  /** Resolved datum text, e.g. "TOP" or "COTA Fe = +20 mm". */
  datumLabel: string;
  /** e.g. '3" Sch 40 · OD 88.9 mm · ID 77.92 mm · R 114.3 mm'. */
  elbowLabel: string;
  /** e.g. 'Receiver 6" · D 168.3 mm'. */
  receiverLabel: string;
}

export interface ElbowOnPipePdfLabels {
  receiver: ElbowOnPipeReceiverTemplateMeta;
  guide: ElbowOnPipeMarkingGuideMeta;
  /** False when the locale is not PDF-encodable and the ASCII English set was used. */
  localized: boolean;
}

export function buildElbowOnPipePdfLabels(inputs: ElbowOnPipePdfLabelInputs): ElbowOnPipePdfLabels {
  const { translate } = inputs;
  const tr = (key: string) => pdfSafeLabel(translate(`tools.elbowOnPipe.${key}`));
  const trLayout = (key: string) => pdfSafeLabel(translate(`tools.branchLayout.${key}`));
  const steps = [1, 2, 3, 4, 5].map(step => tr(`pdfStep${step}`));
  const localizedValues = [
    tr('pdfReceiverTitle'), tr('pdfGuideTitle'), tr('pdfConventionReceiver'), tr('pdfConventionElbow'),
    tr('pdfReceiverOrigin'), tr('pdfReceiverXAxis'), tr('pdfReceiverYAxis'), tr('pdfTowardTop'), tr('pdfTowardBop'),
    tr('pdfCrown'), tr('pdfLegPlane'), tr('pdfEndFace'), tr('cotaX'), tr('pdfCotaY'), tr('pdfCotaYAbsent'), tr('pdfCotaYNote'),
    tr('pdfGuideNote'), tr('pdfStripTitle'), tr('pdfColPsi'), tr('pdfColArcPos'), tr('pdfColArcRadius'), tr('pdfColArcLength'),
    tr('pdfColBend'), tr('pdfColLimit'), tr('pdfLimitCell'), tr('pdfSchematicTitle'), tr('pdfNotToScale'),
    tr('pdfSection'), tr('pdfElevation'), tr('pdfEndPlane'), tr('pdfEndFaceLegend'), tr('pdfArcDirection'),
    tr('pdfCalibration'), trLayout('page'), trLayout('overlap'), ...steps,
  ];
  const localized = localizedValues.every(pdfLatin1Safe);

  const datumLabel = pdfSafeLabel(inputs.datumLabel);
  const elbowLabel = pdfSafeLabel(inputs.elbowLabel);
  const receiverLabel = pdfSafeLabel(inputs.receiverLabel);
  const pick = (value: string, fallback: string) => (localized ? value : fallback);

  const receiver: ElbowOnPipeReceiverTemplateMeta = {
    titleLabel: pick(tr('pdfReceiverTitle'), EN.receiverTitle),
    familyLabel: 'CODO-TUBO',
    datumLabel, elbowLabel, receiverLabel,
    conventionLabel: pick(tr('pdfConventionReceiver'), EN.conventionReceiver),
    originLabel: pick(tr('pdfReceiverOrigin'), EN.receiverOrigin),
    xAxisLabel: pick(tr('pdfReceiverXAxis'), EN.receiverXAxis),
    yAxisLabel: pick(tr('pdfReceiverYAxis'), EN.receiverYAxis),
    towardTopLabel: pick(tr('pdfTowardTop'), EN.towardTop),
    towardBopLabel: pick(tr('pdfTowardBop'), EN.towardBop),
    crownLabel: pick(tr('pdfCrown'), EN.crown),
    legPlaneLabel: pick(tr('pdfLegPlane'), EN.legPlane),
    endFaceLabel: pick(tr('pdfEndFace'), EN.endFace),
    cotaXLabel: pick(tr('cotaX'), EN.cotaX),
    cotaYLabel: pick(tr('pdfCotaY'), EN.cotaY),
    cotaYNote: pick(tr('pdfCotaYNote'), EN.cotaYNote),
    cotaYAbsent: pick(tr('pdfCotaYAbsent'), EN.cotaYAbsent),
    pageLabel: pick(trLayout('page'), EN.page),
    overlapLabel: pick(trLayout('overlap'), EN.overlap),
    calibrationNote: pick(tr('pdfCalibration'), EN.calibrationReceiver),
    printAtActualSize: PDF_PRINT_AT_ACTUAL_SIZE,
    generatedLabel: 'PIPINGBOX',
  };

  const guide: ElbowOnPipeMarkingGuideMeta = {
    titleLabel: pick(tr('pdfGuideTitle'), EN.guideTitle),
    familyLabel: 'CODO-TUBO',
    datumLabel, elbowLabel, receiverLabel,
    conventionLabel: pick(tr('pdfConventionElbow'), EN.conventionElbow),
    guideNote: pick(tr('pdfGuideNote'), EN.guideNote),
    stripTitle: pick(tr('pdfStripTitle'), EN.stripTitle),
    closureLabel: '360° = P1',
    cotaXLabel: pick(tr('cotaX'), EN.cotaX),
    cotaYLabel: pick(tr('pdfCotaY'), EN.cotaY),
    cotaYAbsent: pick(tr('pdfCotaYAbsent'), EN.cotaYAbsent),
    cotaYNote: pick(tr('pdfCotaYNote'), EN.cotaYNote),
    colStation: 'P',
    colPsi: pick(tr('pdfColPsi'), EN.colPsi),
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
    endFaceLabel: pick(tr('pdfEndFaceLegend'), EN.endFaceLegend),
    arcDirectionLabel: pick(tr('pdfArcDirection'), EN.arcDirection),
    steps: localized ? steps : [...EN.steps],
    pageLabel: pick(trLayout('page'), EN.page),
    overlapLabel: pick(trLayout('overlap'), EN.overlap),
    calibrationNote: pick(tr('pdfCalibration'), EN.calibrationGuide),
    printAtActualSize: PDF_PRINT_AT_ACTUAL_SIZE,
    generatedLabel: 'PIPINGBOX',
  };

  return { receiver, guide, localized };
}

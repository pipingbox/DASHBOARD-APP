/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C — i18n resolver for the fabrication
 * PDF exporter.
 *
 * The exporter (`pipe-comb-fab-pdf.ts`) is deliberately i18n-free so it
 * stays testable in Node; this module is the ONLY place where i18next
 * keys are resolved into the `PdfStrings` contract. Screen and PDF share
 * the same locale keys (`tools.prefab.pipeComb.fab.*` plus the
 * PDF-specific `fab.pdf.*` set), so a value cannot read differently on
 * screen and in the document.
 *
 * ASCII constraint: jsPDF's standard-14 Helvetica is WinAnsi-encoded, so
 * arrows ("→", "↔") and bullets are NOT encodable and would render as
 * garbage in the real file. PDF templates therefore use "to" / "<->" /
 * "-" and the mark origin/destination strings are resolved through the
 * same localized mapping as the screen (which uses "→" only in HTML).
 */

import type { TFunction } from 'i18next';
import type {
  PipeCombFabricationSolution,
  FabricationWarning,
} from './pipe-comb-fabrication';
import type { PdfStrings } from './pipe-comb-fab-pdf';
import type { LengthUnit } from '@/tools/core/units';
import { formatLengthForUnit } from './number-input.ts';

/** Localized warning line, identical wording to the on-screen list. */
function warningLine(
  w: FabricationWarning,
  t: TFunction,
  fmt: (mm: number) => string,
): string {
  const key = `tools.prefab.pipeComb.fab.warn.${w.code}`;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(w.params)) {
    if (typeof v === 'number' && (k === 'clearance' || k === 'clr' || k === 'halfOd' || k === 'intradosRadius' || k === 'weldGap')) {
      params[k] = fmt(v);
    } else {
      params[k] = String(v);
    }
  }
  return t(key, params);
}

/** Localized mark origin/destination. Same mapping as the screen's
 *  `markEndpointLabel`, but WITHOUT the HTML-only "→" (WinAnsi). */
function markEndpoint(raw: string, t: TFunction): string {
  switch (raw) {
    case 'theoretical axis intersection E':
      return t('tools.prefab.pipeComb.fab.markOrigin.axisIntersection');
    case 'kept face (physical accessory face)':
      return t('tools.prefab.pipeComb.fab.markOrigin.keptFace');
    case 'kept-face plane':
      return t('tools.prefab.pipeComb.fab.markOrigin.keptFacePlane');
    case 'inlet tangent point T1':
      return t('tools.prefab.pipeComb.fab.markOrigin.tangentT1');
    case 'elbow face plane (kept face or cut face)':
      return t('tools.prefab.pipeComb.fab.markDest.elbowFacePlane');
    case 'cut centerline point projected along the inlet axis':
      return t('tools.prefab.pipeComb.fab.markDest.cutCenterlineProjected');
    case 'tangent point (either tangent)':
      return t('tools.prefab.pipeComb.fab.markDest.tangentPoint');
    case 'outlet tangent point T2':
      return t('tools.prefab.pipeComb.fab.markDest.outletTangentT2');
  }
  const cutPlane = raw.match(/^cut plane at kept angle ([0-9.]+) deg$/);
  if (cutPlane) return t('tools.prefab.pipeComb.fab.markDest.cutPlaneAtAngle', { angle: cutPlane[1] });
  return raw;
}

/** Localized joint face label (own face vs elbow face stay distinct). */
function jointFace(raw: string, t: TFunction): string {
  const own = raw.match(/^(P\d+)-IN own joint face/);
  if (own) return t('tools.prefab.pipeComb.fab.endOwnJointFace', { id: `${own[1]}-IN` });
  const ownOut = raw.match(/^(P\d+)-OUT own joint face/);
  if (ownOut) return t('tools.prefab.pipeComb.fab.endOwnJointFace', { id: `${ownOut[1]}-OUT` });
  if (raw === 'inlet face') return t('tools.prefab.pipeComb.fab.endInletFace');
  if (raw === 'cut face') return t('tools.prefab.pipeComb.fab.endCutFace');
  return raw;
}

/**
 * Build the complete, already-localized string set for one immutable
 * export snapshot. Pure function of (solution, unit, language): calling
 * it twice with the same inputs yields the same document strings.
 */
export function buildFabPdfStrings(
  sol: PipeCombFabricationSolution,
  unit: LengthUnit,
  t: TFunction,
): PdfStrings {
  const fmt = (mm: number) => `${formatLengthForUnit(mm, unit)} ${unit}`;
  const K = 'tools.prefab.pipeComb.fab.pdf';
  return {
    title: t(`${K}.title`),
    docId: t(`${K}.docId`),
    date: t(`${K}.date`),
    unit: t(`${K}.unit`),
    language: t(`${K}.language`),
    jobRef: t(`${K}.jobRef`),
    pageOf: t(`${K}.pageOf`),
    generalView: t(`${K}.generalView`),
    detailView: t(`${K}.detailView`),
    cutList: t('tools.prefab.pipeComb.fab.cutListTitle'),
    elbowDetail: t(`${K}.elbowDetail`),
    markingTitle: t('tools.prefab.pipeComb.fab.marksTitle'),
    jointsTitle: t(`${K}.jointsTitle`),
    warningsTitle: t(`${K}.warningsTitle`),
    notToScale: t(`${K}.notToScale`),
    nominalModelNote: t('tools.prefab.pipeComb.fab.modelNote'),
    notCertified: t(`${K}.notCertified`),
    colPiece: t('tools.prefab.pipeComb.fab.colPiece'),
    colQty: t(`${K}.colQty`),
    colType: t(`${K}.colType`),
    colFinished: t('tools.prefab.pipeComb.fab.colFinished'),
    colAllowance: t('tools.prefab.pipeComb.fab.colAllowance'),
    colCut: t('tools.prefab.pipeComb.fab.colCut'),
    colStatus: t('tools.prefab.pipeComb.fab.colStatus'),
    typeInlet: t('tools.prefab.pipeComb.fab.posInlet'),
    typeOutlet: t('tools.prefab.pipeComb.fab.posOutlet'),
    typeBend: t('tools.prefab.pipeComb.fab.posBend'),
    statusOk: t('tools.prefab.pipeComb.fab.pieceStatus.ok'),
    statusInvalid: t('tools.prefab.pipeComb.fab.pieceStatus.invalid'),
    statusPending: t('tools.prefab.pipeComb.fab.pieceStatus.pending-references'),
    accessoriesTitle: t(`${K}.accessoriesTitle`),
    accessoryLine: t(`${K}.accessoryLine`),
    bendAccessoryLine: t(`${K}.bendAccessoryLine`),
    dimLin: 'Lin',
    dimLout: 'Lout',
    dimDi: 'Di',
    dimDf: 'Df',
    dimStagger: 'A',
    dimAngle: t(`${K}.dimAngle`),
    dimFinished: t('tools.prefab.pipeComb.fab.draw.finished'),
    dimCut: t('tools.prefab.pipeComb.fab.draw.cut'),
    dimGap: t(`${K}.dimGap`),
    refEnt: 'REF-ENT',
    refSal: 'REF-SAL',
    axisE: 'E{pipe}',
    pipeLabel: 'P{pipe}',
    elbowSpecLine: t(`${K}.elbowSpecLine`),
    clrSourceCatalog: t('tools.prefab.pipeComb.fab.clrSourceCatalog'),
    clrSourceCustom: t('tools.prefab.pipeComb.fab.clrSourceCustom'),
    keptAngleLine: t(`${K}.keptAngleLine`),
    bendAngleLine: t(`${K}.bendAngleLine`),
    takeOutLine: t(`${K}.takeOutLine`),
    markMaterial: t('tools.prefab.pipeComb.fab.marksMaterial'),
    markReference: t('tools.prefab.pipeComb.fab.marksReference'),
    markLine: t(`${K}.markLine`),
    jointLine: t(`${K}.jointLine`),
    gapNote: t(`${K}.dimGap`),
    allowanceNote: t(`${K}.allowanceNote`),
    straightInlet: t('tools.prefab.pipeComb.fab.draw.straightInlet'),
    straightOutlet: t('tools.prefab.pipeComb.fab.draw.straightOutlet'),
    arcDeveloped: t('tools.prefab.pipeComb.fab.draw.arcDeveloped'),
    barDeveloped: t(`${K}.barDeveloped`),
    warnings: sol.warnings.map((w) => warningLine(w, t, fmt)),
    marks: sol.elbow.marks.map((m) => ({
      id: m.id,
      label: t(`tools.prefab.pipeComb.fab.mark.${m.id}`),
      origin: markEndpoint(m.origin, t),
      destination: markEndpoint(m.destination, t),
      method: t(`tools.prefab.pipeComb.fab.method.${m.method}`),
      onMaterial: m.onMaterial,
    })),
  };
}

/**
 * Localized joint face resolver: the exporter's joint lines receive faces
 * as stable internal strings from the module; this maps them to the same
 * localized labels used on screen (own face vs elbow face stay distinct).
 */
export function localizeJointFace(raw: string, t: TFunction): string {
  return jointFace(raw, t);
}

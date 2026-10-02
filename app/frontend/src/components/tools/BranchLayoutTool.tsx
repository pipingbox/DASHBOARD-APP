import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { SCHEDULE_WT } from '@/tools/data/elbowData';
import { formatMm } from '@/tools/branch/formatMm';
import {
  computeBranchIntersection,
  BETA_MIN_DEG,
  BETA_MAX_DEG,
  type BranchIntersectionResult,
} from '@/tools/branch/branchIntersectionGeometry';
import { buildBranchTemplate } from '@/tools/branch/branchTemplateSvg';
import { buildPicajeTemplate } from '@/tools/branch/branchPicajeTemplateSvg';
import { PDF_PAGE_FORMATS, DEFAULT_PDF_PAGE_FORMAT_ID } from '@/tools/branch/pdfPageFormat';
import type { PdfPageFormatId } from '@/tools/branch/pdfPageFormat';
import { buildBranchIsometric } from '@/tools/branch/branchIsometricSvg';
import { svgPagesToPdf, pdfLatin1Safe } from '@/tools/branch/svgMmToPdf';
import BranchOnElbowPanel from './BranchOnElbowPanel';
import ElbowOnPipePanel from './ElbowOnPipePanel';

/* ─── NPS pipe data (OD in mm) ─── */
const NPS_OPTIONS: { label: string; od: number }[] = [
  { label: '1/2"', od: 21.3 }, { label: '3/4"', od: 26.7 }, { label: '1"', od: 33.4 },
  { label: '1-1/4"', od: 42.2 }, { label: '1-1/2"', od: 48.3 }, { label: '2"', od: 60.3 },
  { label: '2-1/2"', od: 73.0 }, { label: '3"', od: 88.9 }, { label: '4"', od: 114.3 },
  { label: '5"', od: 141.3 }, { label: '6"', od: 168.3 }, { label: '8"', od: 219.1 },
  { label: '10"', od: 273.0 }, { label: '12"', od: 323.8 }, { label: '14"', od: 355.6 },
  { label: '16"', od: 406.4 }, { label: '18"', od: 457.2 }, { label: '20"', od: 508.0 },
  { label: '24"', od: 609.6 }, { label: '30"', od: 762.0 }, { label: '36"', od: 914.4 },
];

const SCHEDULES = ['10', '40', '80', '160'];
const DIVISION_PRESETS = [12, 16, 24, 36, 48];

/* ───────────────────────────────────────────────────────────────────────────
   ASME B31.3 §304.3.3 — Reinforcement of welded branch connections

   Nomenclature follows the Code:
     A1 = REQUIRED reinforcement area
     A2 = area resulting from excess header (run) wall thickness
     A3 = area resulting from excess branch wall thickness
     A4 = area of welds and added reinforcement (pad/saddle) within the zone
   Acceptance criterion: A2 + A3 + A4 >= A1
   ─────────────────────────────────────────────────────────────────────────── */

/* Reference allowable stresses S (ASME B31.3 Appendix A, Table A-1).
   Only values that can be stated with confidence are listed, each with an
   explicit temperature basis. S is ALWAYS a user input; this list is a
   convenience selector, never an authority. */
interface AllowableStressRef {
  id: string;
  material: string;
  /** Basic allowable stress in MPa */
  s: number;
  /** Explicit temperature basis for the quoted value */
  basis: string;
}

const ALLOWABLE_STRESS_REFS: AllowableStressRef[] = [
  { id: 'a106b', material: 'ASTM A106 Gr. B (seamless CS)', s: 137.9, basis: '−29 °C to 204 °C (−20 °F to 400 °F) · 20.0 ksi' },
  { id: 'a333gr6', material: 'ASTM A333 Gr. 6 (low-temp CS)', s: 137.9, basis: '−46 °C to 204 °C (−50 °F to 400 °F) · 20.0 ksi' },
  { id: 'a312tp316l', material: 'ASTM A312 TP316L (austenitic SS)', s: 115.1, basis: '38 °C to 149 °C (100 °F to 300 °F) · 16.7 ksi' },
];

interface ReinforcementInput {
  headerOD: number;      // Dh — header outside diameter (mm)
  headerWT: number;      // Th — header nominal wall thickness (mm)
  branchOD: number;      // Db — branch outside diameter (mm)
  branchWT: number;      // Tb — branch nominal wall thickness (mm)
  angleDeg: number;      // β — angle between branch and header axes (deg)
  pressure: number;      // P — internal design gauge pressure (MPa)
  allowableStress: number; // S — basic allowable stress (MPa)
  qualityFactor: number; // E — weld joint quality factor
  weldStrengthFactor: number; // W — weld joint strength reduction factor
  coefficientY: number;  // Y — coefficient per Table 304.1.1
  corrosion: number;     // c — corrosion/erosion allowance (mm)
  millTolerance: number; // mill tolerance as a fraction (0.125 = 12.5%)
  weldLegBranch: number; // branch fillet weld leg (mm)
  weldLegPad: number;    // pad fillet weld leg (mm)
  padThickness: number;  // Tr — thickness of user-specified pad (mm), 0 = none
  padOD: number;         // outside diameter of user-specified pad (mm), 0 = none
}

interface ReinforcementResult {
  sinBeta: number;
  tr: number;            // header pressure design thickness (mm)
  tb: number;            // branch pressure design thickness (mm)
  thMin: number;         // header minimum wall after mill tolerance (mm)
  tbMin: number;         // branch minimum wall after mill tolerance (mm)
  d1: number;            // effective length removed from header (mm)
  d2: number;            // half-width of reinforcement zone (mm)
  l4: number;            // height of reinforcement zone (mm)
  a1: number;            // REQUIRED area (mm²)
  a2: number;            // header excess area (mm²)
  a3: number;            // branch excess area (mm²)
  a4: number;            // weld + pad area (mm²)
  aAvailable: number;    // A2 + A3 + A4 (mm²)
  deficit: number;       // A1 − available, clamped at >= 0 (mm²)
  adequate: boolean;     // A2 + A3 + A4 >= A1
  padRequired: boolean;
  reqPadArea: number;    // additional pad area needed (mm²)
  reqPadThickness: number; // pad thickness to cover the deficit (mm)
  reqPadWidth: number;   // pad width each side of the hole (mm)
  reqPadOD: number;      // resulting pad outside diameter (mm)
  padWidthLimited: boolean; // true when the d2 width limit cannot cover deficit
  valid: boolean;        // inputs produce a physically meaningful result
}

/** §304.1.2 pressure design thickness for straight pipe: t = P·D / (2·(S·E·W + P·Y)) */
function pressureDesignThickness(
  P: number, D: number, S: number, E: number, W: number, Y: number
): number {
  const denom = 2 * (S * E * W + P * Y);
  if (!(denom > 0)) return NaN;
  return (P * D) / denom;
}

function calcReinforcement(input: ReinforcementInput): ReinforcementResult {
  const {
    headerOD: Dh, headerWT: Th, branchOD: Db, branchWT: Tb, angleDeg,
    pressure: P, allowableStress: S, qualityFactor: E, weldStrengthFactor: W,
    coefficientY: Y, corrosion: c, millTolerance,
    weldLegBranch, weldLegPad, padThickness: Tr, padOD,
  } = input;

  const beta = (angleDeg * Math.PI) / 180;
  const sinBeta = Math.sin(beta);

  // Pressure design thickness, computed separately for header and branch.
  const tr = pressureDesignThickness(P, Dh, S, E, W, Y);
  const tb = pressureDesignThickness(P, Db, S, E, W, Y);

  // Mill tolerance applies to the AS-SUPPLIED wall, producing the minimum
  // wall that may actually be present. It is NOT a required thickness.
  const thMin = Th * (1 - millTolerance);
  const tbMin = Tb * (1 - millTolerance);

  const invalid =
    !isFinite(tr) || !isFinite(tb) || sinBeta <= 0 ||
    Dh <= 0 || Th <= 0 || Db <= 0 || Tb <= 0;

  // d1 = effective length removed from the header at its surface.
  const d1 = (Db - 2 * (Tb - c)) / sinBeta;

  // d2 = half-width of the reinforcement zone: greater of d1 or
  //      (Tb − c) + (Th − c) + d1/2, but never more than Dh.
  const d2 = Math.min(Math.max(d1, (Tb - c) + (Th - c) + d1 / 2), Dh);

  // L4 = height of the reinforcement zone: lesser of 2.5(Th − c) or
  //      2.5(Tb − c) + Tr.
  const l4 = Math.min(2.5 * (Th - c), 2.5 * (Tb - c) + Tr);

  // A1 — REQUIRED area. The (2 − sin β) factor is mandatory.
  const a1 = Math.max(0, tr * d1 * (2 - sinBeta));

  // A2 — excess header wall within the zone.
  const a2 = Math.max(0, (2 * d2 - d1) * (thMin - tr - c));

  // A3 — excess branch wall within the zone (both sides, hence the factor 2).
  const a3 = Math.max(0, (2 * l4 * (tbMin - tb - c)) / sinBeta);

  // A4 — fillet welds plus any reinforcing pad lying inside the zone.
  // Fillet weld area = leg²/2 each; the branch weld appears twice, and the
  // pad-to-header weld twice.
  const branchWeldArea = 2 * (weldLegBranch * weldLegBranch) / 2;
  const padWeldArea = Tr > 0 ? 2 * (weldLegPad * weldLegPad) / 2 : 0;
  // Pad material counted only out to the d2 limit and only above the header.
  const padHalfWidthRaw = padOD > 0 ? (padOD - d1 * sinBeta) / 2 : 0;
  const padHalfWidth = Math.max(0, Math.min(padHalfWidthRaw, d2 - d1 / 2));
  const padArea = Tr > 0 ? 2 * padHalfWidth * Tr : 0;
  const a4 = Math.max(0, branchWeldArea + padWeldArea + padArea);

  const aAvailable = a2 + a3 + a4;
  const deficit = Math.max(0, a1 - aAvailable);
  const adequate = aAvailable >= a1;

  // Size a pad for the deficit, honouring the d2 half-width limit.
  // Usable width each side of the branch = d2 − d1/2.
  const usableHalfWidth = Math.max(0, d2 - d1 / 2);
  const totalUsableWidth = 2 * usableHalfWidth;
  let reqPadThickness = 0;
  let reqPadWidth = 0;
  let reqPadOD = 0;
  let padWidthLimited = false;

  if (!adequate && totalUsableWidth > 0) {
    reqPadWidth = usableHalfWidth;
    // Round the thickness up to the next 0.5 mm (plate practice).
    reqPadThickness = Math.ceil((deficit / totalUsableWidth) * 2) / 2;
    reqPadOD = d1 * sinBeta + 2 * reqPadWidth;
    // A pad thicker than the header wall is unusual; flag rather than silently accept.
    padWidthLimited = reqPadThickness > Th;
  } else if (!adequate) {
    padWidthLimited = true;
  }

  const r = (v: number) => (isFinite(v) ? Math.round(v * 100) / 100 : 0);

  return {
    sinBeta: r(sinBeta),
    tr: r(tr), tb: r(tb), thMin: r(thMin), tbMin: r(tbMin),
    d1: r(d1), d2: r(d2), l4: r(l4),
    a1: r(a1), a2: r(a2), a3: r(a3), a4: r(a4),
    aAvailable: r(aAvailable),
    deficit: r(deficit),
    adequate,
    padRequired: !adequate,
    reqPadArea: r(deficit),
    reqPadThickness: r(reqPadThickness),
    reqPadWidth: r(reqPadWidth),
    reqPadOD: r(reqPadOD),
    padWidthLimited,
    valid: !invalid,
  };
}

/* ─── Helper: get available schedules for a given NPS ─── */
function getSchedulesForNPS(npsLabel: string): string[] {
  const data = SCHEDULE_WT[npsLabel];
  if (!data) return SCHEDULES;
  return Object.keys(data).filter(s => data[s] > 0);
}

function getWT(npsLabel: string, schedule: string): number {
  return SCHEDULE_WT[npsLabel]?.[schedule] ?? 0;
}

type FabricationMode = 'template' | 'marking';

/** Geometry families offered by the injerto calculator. */
type BranchFamily = 'straight' | 'elbow' | 'elbowOnPipe';

/* Heading copy per family. Kept as a table so adding a family cannot leave the
   header showing another family's description. */
const FAMILY_COPY: Record<BranchFamily, { subtitle: string; description: string }> = {
  straight: {
    subtitle: 'tools.branchLayout.subtitle',
    description: 'tools.branchLayout.description',
  },
  elbow: {
    subtitle: 'tools.branchOnElbow.subtitle',
    description: 'tools.branchOnElbow.description',
  },
  elbowOnPipe: {
    subtitle: 'tools.elbowOnPipe.subtitle',
    description: 'tools.elbowOnPipe.description',
  },
};

/* ─── Component ─── */
export default function BranchLayoutTool() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [family, setFamily] = useState<BranchFamily>('straight');

  const [headerNPS, setHeaderNPS] = useState('6"');
  const [branchNPS, setBranchNPS] = useState('3"');
  const [headerSch, setHeaderSch] = useState('40');
  const [branchSch, setBranchSch] = useState('40');
  const [angle, setAngle] = useState(90);
  const [divisions, setDivisions] = useState<number>(24);
  const [mode, setMode] = useState<FabricationMode>('template');
  const [refLength, setRefLength] = useState<number>(200);
  const [pdfFormat, setPdfFormat] = useState<PdfPageFormatId>(DEFAULT_PDF_PAGE_FORMAT_ID);
  const [engOpen, setEngOpen] = useState(false);

  /* ── ASME B31.3 design inputs ── */
  const [pressure, setPressure] = useState<number>(5);          // P (MPa)
  const [allowableStress, setAllowableStress] = useState<number>(137.9); // S (MPa)
  const [qualityFactor, setQualityFactor] = useState<number>(1.0);       // E
  const [weldStrengthFactor, setWeldStrengthFactor] = useState<number>(1.0); // W
  const [coefficientY, setCoefficientY] = useState<number>(0.4);         // Y
  const [corrosion, setCorrosion] = useState<number>(1.5);               // c (mm)
  const [millTolerancePct, setMillTolerancePct] = useState<number>(12.5);
  const [weldLegBranch, setWeldLegBranch] = useState<number>(6);
  const [weldLegPad, setWeldLegPad] = useState<number>(6);
  const [padThickness, setPadThickness] = useState<number>(0);  // Tr (mm)
  const [padOD, setPadOD] = useState<number>(0);                // pad OD (mm)

  // Derived values
  const headerOD = NPS_OPTIONS.find(o => o.label === headerNPS)?.od ?? 168.3;
  const branchOD = NPS_OPTIONS.find(o => o.label === branchNPS)?.od ?? 88.9;
  const headerWT = getWT(headerNPS, headerSch);
  const branchWT = getWT(branchNPS, branchSch);
  const branchID = branchOD - 2 * branchWT;

  const headerSchOptions = getSchedulesForNPS(headerNPS);
  const branchSchOptions = getSchedulesForNPS(branchNPS);

  const designInputsValid =
    pressure > 0 && allowableStress > 0 && qualityFactor > 0 && weldStrengthFactor > 0 &&
    corrosion >= 0 && millTolerancePct >= 0 && millTolerancePct < 100;

  /* ── Canonical fabrication geometry: ONE engine result feeds the branch
        table, the development preview, the header picaje and the print
        template. No presentation component computes geometry on its own. ── */
  const geometry: BranchIntersectionResult = useMemo(() => {
    return computeBranchIntersection({
      headerOuterRadius: headerOD / 2,
      branchOuterDiameter: branchOD,
      branchInnerDiameter: branchWT > 0 ? branchID : -1,
      betaDeg: angle,
      divisions,
      referenceLength: mode === 'marking' ? refLength : undefined,
    });
  }, [headerOD, branchOD, branchID, branchWT, angle, divisions, mode, refLength]);

  const geometryValid = geometry.valid && headerWT > 0 && branchWT > 0;

  /* ── Isometric tube-on-tube view (pure module; canonical stations only) ── */
  const isometric = useMemo(() => {
    if (!geometryValid) return null;
    return buildBranchIsometric(geometry, { width: 480, height: 300 });
  }, [geometry, geometryValid]);

  /* ── Picaje physical extents (from the canonical stations; screen only) ── */
  const picajeXs = geometryValid ? geometry.stations.map(s => s.picajeX) : [];
  const picajeYs = geometryValid ? geometry.stations.map(s => s.picajeY) : [];
  const picajeXRange = picajeXs.length ? Math.max(...picajeXs) - Math.min(...picajeXs) : 0;
  const picajeYRange = picajeYs.length ? Math.max(...picajeYs) - Math.min(...picajeYs) : 0;

  const reinforcement = useMemo(() => {
    if (!geometryValid || !designInputsValid) return null;
    return calcReinforcement({
      headerOD, headerWT, branchOD, branchWT, angleDeg: angle,
      pressure, allowableStress, qualityFactor, weldStrengthFactor,
      coefficientY, corrosion, millTolerance: millTolerancePct / 100,
      weldLegBranch, weldLegPad, padThickness, padOD,
    });
  }, [
    geometryValid, designInputsValid,
    headerOD, headerWT, branchOD, branchWT, angle,
    pressure, allowableStress, qualityFactor, weldStrengthFactor, coefficientY,
    corrosion, millTolerancePct, weldLegBranch, weldLegPad, padThickness, padOD,
  ]);

  const handleSave = async () => {
    if (!user || !geometryValid) return;
    await supabase.from(TABLES.toolUsage).insert({
      user_id: user.id,
      tool_name: 'Branch Connection Calculator',
      tool_category: 'Fabrication',
      input_data: {
        headerNPS, branchNPS, headerSch, branchSch, angle, divisions, mode,
        referenceLength: mode === 'marking' ? refLength : null,
        pressure, allowableStress, qualityFactor, weldStrengthFactor,
        coefficientY, corrosion, millTolerancePct,
        weldLegBranch, weldLegPad, padThickness, padOD,
      },
      output_data: {
        reinforcement,
        circumference: geometry.developedCircumference.toFixed(3),
        stationSpacing: geometry.stationSpacing.toFixed(3),
      },
    });
    toast.success(t('tools.calculationSaved'));
  };

  /* ── Deterministic physical PDF artifacts (H-001 final delta, PO §2/§6).
        A4 landscape pages in physical mm; no browser window.print() scaling
        and no mobile fit-to-page. Byte-deterministic (no timestamps). ── */
  const pdfMetaSafe = (m: Record<string, unknown>) =>
    Object.values(m).every(v => typeof v !== 'string' || pdfLatin1Safe(v));

  /* English fallback for locales that cannot be encoded in PDF Latin-1
     (bg/uk/pl/ro) — keeps the physical artifact legible in every locale. */
  const PDF_EN = {
    flatPattern: 'Branch cut template 1:1 (development)',
    picajeTitle: 'Header picaje template 1:1 (opening)',
    seam: 'Seam', page: 'Page', overlap: 'Overlap', origin: 'Origin (0,0)',
    xAxis: 'arc on header', yAxis: 'header axis',
    wrapNote: 'Wrap the template around the branch OD. Align the seam line with station 1.',
    calibrationNote: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.',
    openingNote: 'Line = nominal opening (reference: branch ID). No bevel or cutting allowance in V1.',
    picajeWrap: 'X = developed circumferential distance on the header surface (wrap direction). Y = axial distance along the header. Align X = 0 with the reference generatrix.',
  } as const;

  const generatedLabel = 'PIPINGBOX · H-001 · deterministic physical artifact';

  const cutMeta = () => {
    const m = {
      headerLabel: `${headerNPS} Sch ${headerSch} (OD ${formatMm(headerOD)} mm)`,
      branchLabel: `${branchNPS} Sch ${branchSch} (OD ${formatMm(branchOD)} mm)`,
      betaDeg: angle,
      titleLabel: t('tools.branchLayout.flatPattern'),
      seamLabel: t('tools.branchLayout.seam', { defaultValue: 'Seam' }),
      pageLabel: t('tools.branchLayout.page', { defaultValue: 'Page' }),
      overlapLabel: t('tools.branchLayout.overlap', { defaultValue: 'Overlap' }),
      wrapNoteLabel: t('tools.branchLayout.wrapNote', { defaultValue: 'Wrap the template around the branch OD. Align the seam line with station 1.' }),
      calibrationNote: t('tools.branchLayout.calibrationNote', { defaultValue: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.' }),
      printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
      generatedLabel,
    };
    return pdfMetaSafe(m) ? m : { ...m, titleLabel: PDF_EN.flatPattern, seamLabel: PDF_EN.seam, pageLabel: PDF_EN.page, overlapLabel: PDF_EN.overlap, wrapNoteLabel: PDF_EN.wrapNote, calibrationNote: PDF_EN.calibrationNote };
  };

  const picajeMeta = () => {
    const m = {
      headerLabel: `${headerNPS} Sch ${headerSch} (OD ${formatMm(headerOD)} mm)`,
      branchRefLabel: `${branchNPS} (ID ${formatMm(branchID)} mm)`,
      betaDeg: angle,
      titleLabel: t('tools.branchLayout.picajeTemplateTitle', { defaultValue: 'Header picaje template 1:1 — opening' }),
      originLabel: t('tools.branchLayout.picajeOrigin', { defaultValue: 'Origin (0,0)' }),
      xAxisLabel: t('tools.branchLayout.picajeAxisX', { defaultValue: 'arc on header' }),
      yAxisLabel: t('tools.branchLayout.picajeAxisY', { defaultValue: 'header axis' }),
      openingNote: t('tools.branchLayout.picajeOpeningNote', { defaultValue: 'Line = nominal opening (reference: branch ID). No bevel or cutting allowance in V1.' }),
      wrapNote: t('tools.branchLayout.picajeWrapNote', { defaultValue: 'X = developed circumferential distance on the header surface (wrap direction). Y = axial distance along the header. Align X = 0 with the reference generatrix.' }),
      calibrationNote: t('tools.branchLayout.calibrationNote', { defaultValue: 'After printing, verify the 100 mm bar with a ruler before marking the pipe.' }),
      printAtActualSize: 'PRINT AT 100% / ACTUAL SIZE',
      pageLabel: t('tools.branchLayout.page', { defaultValue: 'Page' }),
      overlapLabel: t('tools.branchLayout.overlap', { defaultValue: 'Overlap' }),
      generatedLabel,
    };
    return pdfMetaSafe(m) ? m : { ...m, titleLabel: PDF_EN.picajeTitle, originLabel: PDF_EN.origin, xAxisLabel: PDF_EN.xAxis, yAxisLabel: PDF_EN.yAxis, openingNote: PDF_EN.openingNote, wrapNote: PDF_EN.picajeWrap, calibrationNote: PDF_EN.calibrationNote, pageLabel: PDF_EN.page, overlapLabel: PDF_EN.overlap };
  };

  const downloadPdf = (bytes: Uint8Array, filename: string) => {
    // Copy into a Uint8Array<ArrayBuffer> (BlobPart-compatible under TS 5.7+);
    // byte content is identical, so the downloaded PDF is unchanged.
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(t('tools.branchLayout.pdfDownloaded'));
  };

  const slug = (s: string) => String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

  /** CUT template: one physical page at 1:1 when it fits; tiled with additive overlap otherwise. */
  const handleDownloadCutPdf = () => {
    if (!geometryValid) return;
    const tpl = buildBranchTemplate(geometry, {
      format: pdfFormat,
      ordinate: mode === 'marking' ? 'fromEnd' : 'relative',
      meta: cutMeta(),
    });
    const bytes = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
    downloadPdf(bytes, `pipingbox-plantilla-corte-${slug(String(headerNPS))}x${slug(String(branchNPS))}-${angle}deg-${pdfFormat.toLowerCase()}.pdf`);
  };

  /** PICAJE template: physical flat development of the local header surface. */
  const handleDownloadPicajePdf = () => {
    if (!geometryValid) return;
    const tpl = buildPicajeTemplate(geometry, { format: pdfFormat, meta: picajeMeta() });
    const bytes = svgPagesToPdf(tpl.tiles.map(t => ({ svg: t.svg, widthMm: t.widthMm, heightMm: t.heightMm })));
    downloadPdf(bytes, `pipingbox-plantilla-picaje-${slug(String(headerNPS))}x${slug(String(branchNPS))}-${angle}deg-${pdfFormat.toLowerCase()}.pdf`);
  };

  // Screen preview dimensions (NOT a fabrication artifact — preview only)
  const svgWidth = 700;
  const svgHeight = 320;
  const padding = 50;
  const plotW = svgWidth - padding * 2;
  const plotH = svgHeight - padding * 2;

  const ordinateOf = (i: number): number =>
    mode === 'marking'
      ? (geometry.stations[i]?.markFromEnd ?? 0)
      : (geometry.stations[i]?.relativeOrdinate ?? 0);

  const ordValues = geometryValid ? geometry.stations.map((_, i) => ordinateOf(i)) : [];
  const maxOrd = ordValues.length > 0 ? Math.max(...ordValues) : 1;
  const minOrd = ordValues.length > 0 ? Math.min(...ordValues) : 0;
  const ordRange = maxOrd - minOrd || 1;

  const pathD = useMemo(() => {
    if (!geometryValid) return '';
    return geometry.stations.map((st, idx) => {
      const px = padding + (st.arcPosition / geometry.developedCircumference) * plotW;
      const py = padding + plotH - ((ordinateOf(idx) - minOrd) / ordRange) * plotH;
      return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, geometryValid, plotW, plotH, minOrd, ordRange, mode]);

  const geometryErrorText = (() => {
    if (geometryValid || geometry.errors.length === 0) return null;
    const code = geometry.errors[0].code;
    if (code === 'REFERENCE_RADIUS_EXCEEDS_HEADER') {
      return t('tools.branchLayout.errorBranchTooLarge', {
        defaultValue: 'The branch contact radius exceeds the header radius: this connection cannot be fabricated on this header.',
      });
    }
    if (code === 'REFERENCE_LENGTH_TOO_SHORT') {
      return t('tools.branchLayout.errorLengthTooShort', {
        defaultValue: 'Reference length L must be greater than the maximum cut ordinate for this connection.',
      });
    }
    return t('tools.branchLayout.errorInvalidParams');
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.branchLayout.name')}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t(FAMILY_COPY[family].subtitle)}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {t(FAMILY_COPY[family].description)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label={t('tools.branchOnElbow.family')}>
        <button type="button" aria-pressed={family === 'straight'} onClick={() => setFamily('straight')}
          className={`min-h-11 rounded-lg border px-4 py-3 text-left text-sm font-semibold ${family === 'straight' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600'}`}>
          {t('tools.branchOnElbow.familyStraight')}
        </button>
        <button type="button" aria-pressed={family === 'elbow'} onClick={() => setFamily('elbow')}
          className={`min-h-11 rounded-lg border px-4 py-3 text-left text-sm font-semibold ${family === 'elbow' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600'}`}>
          {t('tools.branchOnElbow.familyElbow')}
        </button>
        <button type="button" aria-pressed={family === 'elbowOnPipe'} onClick={() => setFamily('elbowOnPipe')}
          className={`min-h-11 rounded-lg border px-4 py-3 text-left text-sm font-semibold ${family === 'elbowOnPipe' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600'}`}>
          {t('tools.elbowOnPipe.family')}
        </button>
      </div>

      {family === 'elbowOnPipe' ? <ElbowOnPipePanel /> : family === 'elbow' ? <BranchOnElbowPanel /> : (
        <>
      {/* ═══ FABRICATION ═══ */}
      <div className="space-y-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-medium border-b border-zinc-800 pb-2">
          {t('tools.branchLayout.fabrication', { defaultValue: 'Fabrication' })}
        </p>

        {/* Input Section */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Header Pipe */}
          <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
              {t('tools.branchLayout.headerPipe')}
            </p>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">{t('tools.branchLayout.npsSize')}</Label>
              <select
                value={headerNPS}
                onChange={(e) => setHeaderNPS(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
              >
                {NPS_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label} (OD {o.od} mm)</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">{t('tools.branchLayout.schedule')}</Label>
              <select
                value={headerSch}
                onChange={(e) => setHeaderSch(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
              >
                {headerSchOptions.map(s => <option key={s} value={s}>Sch {s} (WT {getWT(headerNPS, s)} mm)</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
              <span>OD: <span className="text-zinc-200">{headerOD} mm</span></span>
              <span>WT: <span className="text-zinc-200">{headerWT} mm</span></span>
              <span>ID: <span className="text-zinc-200">{(headerOD - 2 * headerWT).toFixed(1)} mm</span></span>
            </div>
          </div>

          {/* Branch Pipe — equal nominal sizes allowed (PO D2); the engine validates fabricability */}
          <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
              {t('tools.branchLayout.branchPipe')}
            </p>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">{t('tools.branchLayout.npsSize')}</Label>
              <select
                value={branchNPS}
                onChange={(e) => setBranchNPS(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
              >
                {NPS_OPTIONS.filter(o => o.od <= headerOD).map(o => (
                  <option key={o.label} value={o.label}>{o.label} (OD {o.od} mm)</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">{t('tools.branchLayout.schedule')}</Label>
              <select
                value={branchSch}
                onChange={(e) => setBranchSch(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
              >
                {branchSchOptions.map(s => <option key={s} value={s}>Sch {s} (WT {getWT(branchNPS, s)} mm)</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
              <span>OD: <span className="text-zinc-200">{branchOD} mm</span></span>
              <span>WT: <span className="text-zinc-200">{branchWT} mm</span></span>
              <span>ID: <span className="text-zinc-200">{branchID.toFixed(1)} mm</span></span>
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
              {t('tools.branchLayout.parameters')}
            </p>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">{t('tools.branchLayout.angle')} ({BETA_MIN_DEG}°–{BETA_MAX_DEG}°)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={BETA_MIN_DEG} max={BETA_MAX_DEG} step={1}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="flex-1 accent-[#f59e0b]"
                />
                <span className="w-12 text-right text-sm font-mono text-[#f59e0b]">{angle}°</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-500">
                {t('tools.branchLayout.markingDivisions', { defaultValue: 'Marking divisions around branch circumference' })}
              </Label>
              <select
                value={divisions}
                onChange={(e) => setDivisions(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
              >
                {DIVISION_PRESETS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="space-y-1 pt-1 text-xs text-zinc-500">
              <div>
                {t('tools.branchLayout.perimeterAxis')}: <span className="text-zinc-200 font-mono">{geometryValid ? geometry.developedCircumference.toFixed(3) : (branchOD * Math.PI).toFixed(3)} mm</span>
              </div>
              {geometryValid && (
                <div>
                  {t('tools.branchLayout.stationStep', { defaultValue: 'Station step' })}:{' '}
                  <span className="text-zinc-200 font-mono">{geometry.angularStepDeg.toFixed(1)}° · {geometry.stationSpacing.toFixed(3)} mm</span>
                </div>
              )}
              <div className="text-[10px] text-zinc-600">
                {t('tools.branchLayout.stationsInfo', {
                  defaultValue: '{{n}} divisions → {{m}} boundary lines (the 360° station repeats the 0° seam)',
                  n: divisions,
                  m: divisions + 1,
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Mode: template (no L) vs marking from end (optional L) */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium mb-3">
            {t('tools.branchLayout.mode', { defaultValue: 'Template mode' })}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name="fab-mode"
                checked={mode === 'template'}
                onChange={() => setMode('template')}
                className="accent-[#f59e0b]"
              />
              {t('tools.branchLayout.modeTemplate', { defaultValue: 'Relative template (no length required)' })}
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name="fab-mode"
                checked={mode === 'marking'}
                onChange={() => setMode('marking')}
                className="accent-[#f59e0b]"
              />
              {t('tools.branchLayout.modeMarking', { defaultValue: 'Marking from pipe end' })}
            </label>
            {mode === 'marking' && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-zinc-500 whitespace-nowrap">
                  L — {t('tools.branchLayout.referenceLength', { defaultValue: 'Reference length' })} (mm)
                </Label>
                <input
                  type="number" min={0} step={1}
                  value={refLength}
                  onChange={(e) => setRefLength(Number(e.target.value))}
                  className="w-24 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                />
              </div>
            )}
          </div>
          {mode === 'marking' && (
            <p className="mt-2 text-[10px] text-zinc-600">
              {t('tools.branchLayout.referenceLengthFrom', {
                defaultValue: 'L is measured from the square-cut straight end of the branch pipe.',
              })}
            </p>
          )}
          <p className="mt-2 text-[10px] text-zinc-600">
            {t('tools.branchLayout.contactConvention', {
              defaultValue: 'SET-ON (branch resting on the header): branch cut on branch OD against header OD. Header hole (picaje): branch ID. Template wrap and station spacing: branch OD.',
            })}
          </p>
        </div>

        {/* Geometry errors (explicit failure, never clamped-looking output) */}
        {!geometryValid && geometryErrorText && (
          <div className="border-l-2 border-red-500 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">{geometryErrorText}</p>
          </div>
        )}

        {geometryValid && (
          <>
            {/* Flat Pattern preview (screen preview — not the 1:1 artifact) */}
            <div className="border border-zinc-800/80 bg-zinc-950 p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  {t('tools.branchLayout.flatPattern')}
                </p>
                <span className="text-[9px] text-zinc-600">
                  {t('tools.branchLayout.previewNotToScale', { defaultValue: 'Screen preview — not to scale. Use Print for the physical 1:1 template.' })}
                </span>
              </div>
              <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full max-w-[700px]" style={{ background: '#0a0a0a' }}>
                {/* Ordinate grid lines */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const yPos = padding + (i / 4) * plotH;
                  const val = (maxOrd - (i / 4) * ordRange).toFixed(1);
                  return (
                    <g key={`grid-h-${i}`}>
                      <line x1={padding} y1={yPos} x2={svgWidth - padding} y2={yPos} stroke="#222" strokeWidth="0.5" strokeDasharray="4,4" />
                      <text x={padding - 8} y={yPos + 4} textAnchor="end" fill="#555" fontSize="9">{val}</text>
                    </g>
                  );
                })}

                {/* Marking lines (generatrices) at EVERY canonical station —
                    SCREEN = TABLE = PRINT: same arcPosition feeds all three. */}
                {geometry.stations.map((st, idx) => {
                  const xPos = padding + (st.arcPosition / geometry.developedCircumference) * plotW;
                  const isSeam = idx === 0 || idx === geometry.stations.length - 1;
                  const showNumber = divisions <= 36 || idx % 2 === 0 || isSeam;
                  return (
                    <g key={`station-line-${idx}`}>
                      <line
                        x1={xPos} y1={padding} x2={xPos} y2={svgHeight - padding}
                        stroke={isSeam ? '#22c55e' : '#333'}
                        strokeWidth={isSeam ? 1.2 : 0.6}
                        strokeDasharray={isSeam ? '6,3' : '3,3'}
                        opacity={isSeam ? 0.9 : 0.7}
                      />
                      {showNumber && (
                        <text
                          x={xPos} y={svgHeight - padding + 14} textAnchor="middle"
                          fill={isSeam ? '#22c55e' : '#777'} fontSize="8"
                          fontFamily="monospace"
                        >
                          {idx === geometry.stations.length - 1 ? '≡1' : idx + 1}
                        </text>
                      )}
                      {st.thetaDeg % 90 === 0 && (
                        <text x={xPos} y={svgHeight - padding + 26} textAnchor="middle" fill="#555" fontSize="8">
                          {st.thetaDeg}°
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* Seam identification */}
                <text x={padding + 3} y={padding - 8} fill="#22c55e" fontSize="9" fontFamily="monospace">
                  {t('tools.branchLayout.seam', { defaultValue: 'Seam' })} 0° / 360°
                </text>

                {pathD && (
                  <path
                    d={`${pathD} L${(padding + plotW).toFixed(1)},${(padding + plotH).toFixed(1)} L${padding},${(padding + plotH).toFixed(1)} Z`}
                    fill="#f59e0b" fillOpacity="0.08" stroke="none"
                  />
                )}
                <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {geometry.stations.map((st, idx) => {
                  const px = padding + (st.arcPosition / geometry.developedCircumference) * plotW;
                  const py = padding + plotH - ((ordinateOf(idx) - minOrd) / ordRange) * plotH;
                  return <circle key={`pt-${idx}`} cx={px} cy={py} r="2" fill="#f59e0b" opacity="0.7" />;
                })}

                <text x={svgWidth / 2} y={svgHeight - 5} textAnchor="middle" fill="#888" fontSize="10">
                  {t('tools.branchLayout.perimeterAxis')} ({geometry.developedCircumference.toFixed(1)} mm)
                </text>
                <text x={14} y={svgHeight / 2} textAnchor="middle" fill="#888" fontSize="10" transform={`rotate(-90,14,${svgHeight / 2})`}>
                  {mode === 'marking' ? 'L − s (mm)' : 's − s min (mm)'}
                </text>
                <text x={svgWidth - padding} y={padding - 10} textAnchor="end" fill="#666" fontSize="9">
                  {headerNPS} × {branchNPS} @ {angle}°
                </text>
              </svg>
            </div>

            {/* Branch cut dimension table */}
            <div className="border border-zinc-800/80 bg-zinc-950 p-4 overflow-x-auto">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                {t('tools.branchLayout.dimensionTable')}
              </p>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-950">
                    <tr className="border-b border-zinc-800">
                      <th className="py-1.5 px-2 text-left text-zinc-400">#</th>
                      <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.angleDeg')}</th>
                      <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.arcLength')}</th>
                      <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.cutOrdinate', { defaultValue: 'Cut ordinate s (mm)' })}</th>
                      {mode === 'template' ? (
                        <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.relOrdinate', { defaultValue: 'Rel. ordinate (mm)' })}</th>
                      ) : (
                        <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.markFromEnd', { defaultValue: 'Mark from end (mm)' })}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {geometry.stations.map((st) => (
                      <tr key={st.index} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${st.index === geometry.stations.length - 1 ? 'border-t-2 border-t-zinc-700' : ''}`}>
                        <td className="py-1 px-2 text-zinc-500 whitespace-nowrap">
                          {st.index === geometry.stations.length - 1
                            ? t('tools.branchLayout.closure360', { defaultValue: '360° closure = P1' })
                            : st.index + 1}
                        </td>
                        <td className="py-1 px-2 text-zinc-300">{st.thetaDeg.toFixed(1)}°</td>
                        <td className="py-1 px-2 text-zinc-400 font-mono">{st.arcPosition.toFixed(3)}</td>
                        <td className="py-1 px-2 text-[#f59e0b] font-mono">{st.cutOrdinate.toFixed(2)}</td>
                        <td className="py-1 px-2 text-zinc-300 font-mono">
                          {mode === 'template' ? st.relativeOrdinate.toFixed(2) : st.markFromEnd!.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Header picaje (hole marking) — same canonical stations */}
            <div className="border border-zinc-800/80 bg-zinc-950 p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  {t('tools.branchLayout.headerPicaje', { defaultValue: 'Header hole marking (picaje)' })}
                </p>
                <span className="text-[9px] text-zinc-600">Ø{headerOD}</span>
              </div>
              {/* Fabrication picaje diagram: canonical X/Y stations + dimensions.
                  X = developed circumferential distance on the header surface;
                  Y = axial distance along the header (see note below). */}
              <svg width="420" height="260" viewBox="0 0 420 260" className="mx-auto mb-3">
                {(() => {
                  const st = geometry.stations;
                  const xs = st.map(s => s.picajeX);
                  const ys = st.map(s => s.picajeY);
                  const xMin = Math.min(...xs), xMax = Math.max(...xs);
                  const yMin = Math.min(...ys), yMax = Math.max(...ys);
                  const cx = 210, cy = 128;
                  const sx = 150 / (xMax || 1), sy = 82 / (yMax || 1);
                  const PX = (x: number) => cx + x * sx;
                  const PY = (y: number) => cy - y * sy;
                  const pts = st.map(s => `${PX(s.picajeX).toFixed(1)},${PY(s.picajeY).toFixed(1)}`).join(' ');
                  const cen = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 };
                  const labelStep = Math.max(1, Math.ceil(divisions / 16));
                  const lbl = (i: number): [number, number] => {
                    const dx = st[i].picajeX - cen.x, dy = st[i].picajeY - cen.y;
                    const L = Math.hypot(dx, dy) || 1;
                    return [PX(st[i].picajeX + (dx / L) * 6), PY(st[i].picajeY + (dy / L) * 6)];
                  };
                  return (
                    <g>
                      <rect x="20" y="26" width="380" height="196" fill="none" stroke="#2a2a2a" strokeWidth="1" rx="4" />
                      {/* Centerlines: X = 0 (reference generatrix) and Y = 0 (branch-axis plane) */}
                      <line x1="20" y1={cy} x2="400" y2={cy} stroke="#333" strokeWidth="0.6" strokeDasharray="6,4" />
                      <line x1={cx} y1="26" x2={cx} y2="222" stroke="#333" strokeWidth="0.6" strokeDasharray="6,4" />
                      {/* Helper lines at X/Y extremes */}
                      <line x1={PX(xMin)} y1={PY(yMax)} x2={PX(xMin)} y2={PY(yMin)} stroke="#333" strokeWidth="0.4" strokeDasharray="3,3" opacity="0.5" />
                      <line x1={PX(xMax)} y1={PY(yMax)} x2={PX(xMax)} y2={PY(yMin)} stroke="#333" strokeWidth="0.4" strokeDasharray="3,3" opacity="0.5" />
                      <line x1={PX(xMin)} y1={PY(yMax)} x2={PX(xMax)} y2={PY(yMax)} stroke="#333" strokeWidth="0.4" strokeDasharray="3,3" opacity="0.5" />
                      <line x1={PX(xMin)} y1={PY(yMin)} x2={PX(xMax)} y2={PY(yMin)} stroke="#333" strokeWidth="0.4" strokeDasharray="3,3" opacity="0.5" />
                      {/* Opening contour (canonical stations) */}
                      <polygon points={pts} fill="#f59e0b" fillOpacity="0.07" stroke="#f59e0b" strokeWidth="1.6" />
                      {/* Origin (0,0) */}
                      <circle cx={cx} cy={cy} r="2.5" fill="#f59e0b" />
                      <text x={cx + 5} y={cy - 5} fill="#f59e0b" fontSize="8">(0,0)</text>
                      {/* Stations P1..PN (closure IS P1) */}
                      {st.slice(0, divisions).map((s, i) => (
                        <g key={`picaje-st-${i}`}>
                          <circle cx={PX(s.picajeX)} cy={PY(s.picajeY)} r={i === 0 ? 3.5 : 2.2} fill="none" stroke={i === 0 ? '#22c55e' : '#f59e0b'} strokeWidth={i === 0 ? 1.2 : 0.9} />
                          {i % labelStep === 0 && (() => {
                            const [lx, ly] = lbl(i);
                            return <text x={lx} y={ly + 2.5} fill="#a1a1aa" fontSize="7.5" textAnchor="middle">{i + 1}</text>;
                          })()}
                        </g>
                      ))}
                      {/* Axis direction arrows + labels */}
                      <polygon points={`400,${cy} 394,${cy - 2.5} 394,${cy + 2.5}`} fill="#888" />
                      <polygon points={`${cx},24 ${cx - 2.5},30 ${cx + 2.5},30`} fill="#888" />
                      <text x="392" y={cy - 6} fill="#888" fontSize="9" textAnchor="end">X — {t('tools.branchLayout.picajeAxisX', { defaultValue: 'arc on header' })}</text>
                      <text x={cx + 6} y="36" fill="#888" fontSize="9">Y — {t('tools.branchLayout.picajeAxisY', { defaultValue: 'header axis' })}</text>
                      {/* Min/max annotations */}
                      <text x={PX(xMin)} y="236" fill="#888" fontSize="8" textAnchor="middle">Xmin {xMin.toFixed(1)}</text>
                      <text x={PX(xMax)} y="236" fill="#888" fontSize="8" textAnchor="middle">Xmax {xMax.toFixed(1)}</text>
                      <text x="26" y={PY(yMax) + 3} fill="#888" fontSize="8" textAnchor="middle">Ymax {yMax.toFixed(1)}</text>
                      <text x="26" y={PY(yMin) + 3} fill="#888" fontSize="8" textAnchor="middle">Ymin {yMin.toFixed(1)}</text>
                    </g>
                  );
                })()}
              </svg>
              <p className="text-[10px] text-zinc-500 font-mono mb-2">
                {t('tools.branchLayout.picajeDims', { w: picajeXRange.toFixed(1), h: picajeYRange.toFixed(1) })}
              </p>
              <p className="text-[10px] text-zinc-600 leading-relaxed mb-3">
                {t('tools.branchLayout.picajeNote', {
                  defaultValue: 'Origin (0,0): projection of the axis intersection on the header surface. X follows the header circumference (developed arc, real curved mm); Y runs along the header axis. Station 1 matches the template seam.',
                })}
              </p>
              <div className="max-h-[260px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-950">
                    <tr className="border-b border-zinc-800">
                      <th className="py-1.5 px-2 text-left text-zinc-400">#</th>
                      <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.angleDeg')}</th>
                      <th className="py-1.5 px-2 text-left text-zinc-400">X (mm)</th>
                      <th className="py-1.5 px-2 text-left text-zinc-400">Y (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geometry.stations.map((st) => (
                      <tr key={st.index} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${st.index === geometry.stations.length - 1 ? 'border-t-2 border-t-zinc-700' : ''}`}>
                        <td className="py-1 px-2 text-zinc-500 whitespace-nowrap">
                          {st.index === geometry.stations.length - 1
                            ? t('tools.branchLayout.closure360', { defaultValue: '360° closure = P1' })
                            : st.index + 1}
                        </td>
                        <td className="py-1 px-2 text-zinc-300">{st.thetaDeg.toFixed(1)}°</td>
                        <td className="py-1 px-2 text-zinc-300 font-mono">{st.picajeX.toFixed(1)}</td>
                        <td className="py-1 px-2 text-[#f59e0b] font-mono">{st.picajeY.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Isometric view — tube grafted onto a tube (canonical stations only; no PAD here) */}
            <div className="border border-zinc-800/80 bg-zinc-950 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                {t('tools.branchLayout.isometricView')}
              </p>
              {isometric && (
                <div
                  className="mx-auto max-w-[480px]"
                  dangerouslySetInnerHTML={{ __html: isometric.svg }}
                />
              )}
              <p className="mt-2 text-[10px] text-zinc-600 text-center">
                {t('tools.branchLayout.isometricNote', {
                  defaultValue: 'Set-on: the branch rests on the header OD. The amber curve is the cut saddle from the calculation engine.',
                })}
              </p>
            </div>

            {/* Fabrication actions */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="pdf-format-select" className="text-xs text-zinc-500 whitespace-nowrap">
                  {t('tools.branchLayout.printFormat', { defaultValue: 'Print format' })}
                </Label>
                <select
                  id="pdf-format-select"
                  value={pdfFormat}
                  onChange={(e) => setPdfFormat(e.target.value as PdfPageFormatId)}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
                >
                  {PDF_PAGE_FORMATS.map(f => (
                    <option key={f.id} value={f.id}>{f.id} · {f.widthMm} × {f.heightMm} mm</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleDownloadCutPdf} className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
                {t('tools.branchLayout.print1to1')}
              </Button>
              <Button onClick={handleDownloadPicajePdf} className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
                {t('tools.branchLayout.printPicaje1to1')}
              </Button>
              <Button onClick={handleSave} variant="outline" className="border-zinc-700 !bg-transparent hover:!bg-zinc-900">
                {t('tools.branchLayout.saveCalc')}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ═══ ENGINEERING — ASME B31.3 (collapsible; calculation layer unchanged) ═══ */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setEngOpen(o => !o)}
          className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-medium border-b border-zinc-800 pb-2 hover:text-zinc-200 transition-colors"
        >
          <span>{t('tools.branchLayout.engineering', { defaultValue: 'Engineering — ASME B31.3 reinforcement' })}</span>
          <span className="text-zinc-500 normal-case tracking-normal">{engOpen ? '−' : '+'}</span>
        </button>

        {engOpen && (
          <>
            {/* ── ASME B31.3 Design Inputs ── */}
            <div className="space-y-4 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
                  {t('tools.branchLayout.designInputs', { defaultValue: 'Design Inputs (ASME B31.3)' })}
                </p>
                <span className="text-[9px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">§304.1.2 / §304.3.3</span>
              </div>

              {/* Material reference selector + allowable stress */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    {t('tools.branchLayout.materialReference', { defaultValue: 'Material reference (optional)' })}
                  </Label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const ref = ALLOWABLE_STRESS_REFS.find(m => m.id === e.target.value);
                      if (ref) setAllowableStress(ref.s);
                    }}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
                  >
                    <option value="">
                      {t('tools.branchLayout.materialManual', { defaultValue: 'Enter S manually…' })}
                    </option>
                    {ALLOWABLE_STRESS_REFS.map(m => (
                      <option key={m.id} value={m.id}>{m.material} — {m.s} MPa</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    {ALLOWABLE_STRESS_REFS.map(m => `${m.material}: ${m.s} MPa @ ${m.basis}`).join(' · ')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    S — {t('tools.branchLayout.allowableStress', { defaultValue: 'Basic allowable stress' })} (MPa)
                  </Label>
                  <input
                    type="number" min={0} step={0.1}
                    value={allowableStress}
                    onChange={(e) => setAllowableStress(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
              </div>

              {/* Prominent allowable-stress warning */}
              <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-3">
                <p className="text-[11px] text-[#f59e0b] leading-relaxed">
                  {t('tools.branchLayout.allowableStressWarning', {
                    defaultValue:
                      'S varies strongly with design temperature. The listed values are reference points at their stated temperature basis only. You must take S from ASME B31.3 Table A-1 of the applicable code edition for the actual design temperature and material condition.',
                  })}
                </p>
              </div>

              {/* Numeric design parameters */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    P — {t('tools.branchLayout.designPressure', { defaultValue: 'Design pressure' })} (MPa)
                  </Label>
                  <input
                    type="number" min={0} step={0.1}
                    value={pressure}
                    onChange={(e) => setPressure(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    E — {t('tools.branchLayout.qualityFactor', { defaultValue: 'Weld joint quality factor' })}
                  </Label>
                  <input
                    type="number" min={0} max={1} step={0.01}
                    value={qualityFactor}
                    onChange={(e) => setQualityFactor(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    W — {t('tools.branchLayout.weldStrengthFactor', { defaultValue: 'Weld strength reduction factor' })}
                  </Label>
                  <input
                    type="number" min={0} max={1} step={0.01}
                    value={weldStrengthFactor}
                    onChange={(e) => setWeldStrengthFactor(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    Y — {t('tools.branchLayout.coefficientY', { defaultValue: 'Coefficient Y (Table 304.1.1)' })}
                  </Label>
                  <input
                    type="number" min={0} max={1} step={0.01}
                    value={coefficientY}
                    onChange={(e) => setCoefficientY(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    c — {t('tools.branchLayout.corrosionAllowance', { defaultValue: 'Corrosion / erosion allowance' })} (mm)
                  </Label>
                  <input
                    type="number" min={0} step={0.1}
                    value={corrosion}
                    onChange={(e) => setCorrosion(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    {t('tools.branchLayout.millTolerance', { defaultValue: 'Mill tolerance' })} (%)
                  </Label>
                  <input
                    type="number" min={0} max={99} step={0.5}
                    value={millTolerancePct}
                    onChange={(e) => setMillTolerancePct(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    {t('tools.branchLayout.weldLegBranch', { defaultValue: 'Branch fillet weld leg' })} (mm)
                  </Label>
                  <input
                    type="number" min={0} step={0.5}
                    value={weldLegBranch}
                    onChange={(e) => setWeldLegBranch(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">
                    {t('tools.branchLayout.weldLegPad', { defaultValue: 'Pad fillet weld leg' })} (mm)
                  </Label>
                  <input
                    type="number" min={0} step={0.5}
                    value={weldLegPad}
                    onChange={(e) => setWeldLegPad(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                  />
                </div>
              </div>

              {/* Existing pad, if any */}
              <div className="border-t border-zinc-800/60 pt-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  {t('tools.branchLayout.existingPad', { defaultValue: 'Existing reinforcing pad (leave 0 if none)' })}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">
                      Tr — {t('tools.branchLayout.padThickness')} (mm)
                    </Label>
                    <input
                      type="number" min={0} step={0.5}
                      value={padThickness}
                      onChange={(e) => setPadThickness(Number(e.target.value))}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">
                      {t('tools.branchLayout.padOD')} (mm)
                    </Label>
                    <input
                      type="number" min={0} step={1}
                      value={padOD}
                      onChange={(e) => setPadOD(Number(e.target.value))}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono focus:ring-1 focus:ring-[#f59e0b]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Design input validation error */}
            {geometryValid && !designInputsValid && (
              <div className="border-l-2 border-red-500 bg-red-500/5 p-4">
                <p className="text-sm text-red-400">
                  {t('tools.branchLayout.errorDesignInputs', {
                    defaultValue: 'Enter a positive design pressure P, allowable stress S, and factors E and W greater than zero.',
                  })}
                </p>
              </div>
            )}

            {geometryValid && reinforcement && (
              <>
                {/* Results Panel */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 text-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                      {t('tools.branchLayout.d1Label', { defaultValue: 'd1 — Material Removed' })}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#f59e0b] font-mono">{reinforcement.d1.toFixed(1)}</p>
                    <p className="text-[10px] text-zinc-500">mm</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                      {t('tools.branchLayout.a1Required', { defaultValue: 'A1 — Required Area' })}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-zinc-100 font-mono">{reinforcement.a1.toFixed(1)}</p>
                    <p className="text-[10px] text-zinc-500">mm²</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                      {t('tools.branchLayout.availableArea', { defaultValue: 'Available Area' })}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-zinc-100 font-mono">{reinforcement.aAvailable.toFixed(1)}</p>
                    <p className="text-[10px] text-zinc-500">mm² (A2 + A3 + A4)</p>
                  </div>
                  <div className={`rounded-lg border p-4 text-center ${reinforcement.adequate ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                      {t('tools.branchLayout.acceptance', { defaultValue: 'Acceptance (A2+A3+A4 ≥ A1)' })}
                    </p>
                    <p className={`mt-1 text-lg font-bold ${reinforcement.adequate ? 'text-emerald-400' : 'text-red-400'}`}>
                      {reinforcement.adequate
                        ? t('tools.branchLayout.acceptancePass', { defaultValue: 'ADEQUATE' })
                        : t('tools.branchLayout.acceptanceFail', { defaultValue: 'PAD REQUIRED' })}
                    </p>
                    {!reinforcement.adequate && (
                      <p className="text-[10px] text-zinc-400 mt-1">
                        {t('tools.branchLayout.deficit', { defaultValue: 'Deficit' })}: {reinforcement.deficit.toFixed(1)} mm²
                      </p>
                    )}
                  </div>
                </div>

                {/* Full audit breakdown (ASME B31.3 §304.3.3) */}
                <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
                      {t('tools.branchLayout.reinforcementCalc')}
                    </p>
                    <span className="text-[9px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">ASME B31.3 §304.3.3</span>
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                    {t('tools.branchLayout.thicknesses', { defaultValue: 'Pressure design thicknesses (§304.1.2)' })}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500">t<sub>r</sub> ({t('tools.branchLayout.header', { defaultValue: 'header' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.tr.toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">t<sub>b</sub> ({t('tools.branchLayout.branch', { defaultValue: 'branch' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.tb.toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">T<sub>h,min</sub>:</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.thMin.toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">T<sub>b,min</sub>:</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.tbMin.toFixed(2)} mm</span>
                    </div>
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-4 mb-2">
                    {t('tools.branchLayout.zoneGeometry', { defaultValue: 'Reinforcement zone' })}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500">d<sub>1</sub>:</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.d1.toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">d<sub>2</sub> ({t('tools.branchLayout.halfWidth', { defaultValue: 'half-width' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.d2.toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">L<sub>4</sub> ({t('tools.branchLayout.zoneHeight', { defaultValue: 'height' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.l4.toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">sin β:</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.sinBeta.toFixed(3)}</span>
                    </div>
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-4 mb-2">
                    {t('tools.branchLayout.areaBreakdown', { defaultValue: 'Area breakdown' })}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500">A<sub>1</sub> ({t('tools.branchLayout.required', { defaultValue: 'required' })}):</span>
                      <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.a1.toFixed(2)} mm²</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">A<sub>2</sub> ({t('tools.branchLayout.headerExcess', { defaultValue: 'header excess' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.a2.toFixed(2)} mm²</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">A<sub>3</sub> ({t('tools.branchLayout.branchExcess', { defaultValue: 'branch excess' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.a3.toFixed(2)} mm²</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">A<sub>4</sub> ({t('tools.branchLayout.weldsAndPad', { defaultValue: 'welds + pad' })}):</span>
                      <span className="ml-1 text-zinc-200 font-mono">{reinforcement.a4.toFixed(2)} mm²</span>
                    </div>
                  </div>

                  {/* Formulae shown for audit */}
                  <div className="mt-3 pt-3 border-t border-zinc-800/60 text-[10px] text-zinc-600 font-mono leading-relaxed space-y-0.5">
                    <p>t = P·D / (2·(S·E·W + P·Y))</p>
                    <p>d1 = [Db − 2·(Tb − c)] / sin β</p>
                    <p>A1 = tr · d1 · (2 − sin β)</p>
                    <p>A2 = (2·d2 − d1) · (Th,min − tr − c)</p>
                    <p>A3 = 2·L4 · (Tb,min − tb − c) / sin β</p>
                  </div>

                  {/* Pad sizing for the deficit */}
                  {!reinforcement.adequate && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/60">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                        {t('tools.branchLayout.padSizing', { defaultValue: 'Pad sizing for the deficit' })}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-500">{t('tools.branchLayout.requiredPadArea', { defaultValue: 'Required pad area' })}:</span>
                          <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.reqPadArea.toFixed(2)} mm²</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">{t('tools.branchLayout.padThickness')}:</span>
                          <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.reqPadThickness.toFixed(2)} mm</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">{t('tools.branchLayout.padOD')}:</span>
                          <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.reqPadOD.toFixed(1)} mm</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">{t('tools.branchLayout.padWidth')}:</span>
                          <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.reqPadWidth.toFixed(1)} mm</span>
                        </div>
                      </div>
                      {reinforcement.padWidthLimited && (
                        <p className="mt-2 text-[11px] text-red-400 leading-relaxed">
                          {t('tools.branchLayout.padLimitWarning', {
                            defaultValue:
                              'The pad needed exceeds the header wall thickness or the d2 width limit. Reconsider the design: use a heavier header, a thicker branch, or an integrally reinforced fitting.',
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Verification disclaimer */}
                <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
                  <p className="text-[11px] text-[#f59e0b] leading-relaxed">
                    {t('tools.branchLayout.verificationDisclaimer', {
                      defaultValue:
                        'This result is an aid only and must be verified against the governing edition of ASME B31.3 and the project engineering specification before fabrication. Area replacement per §304.3.3 does not cover external loads, fatigue, or the §304.3.2 limitations on branch connections.',
                    })}
                  </p>
                </div>

                {/* Reference note */}
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  {t('tools.branchLayout.referenceNoteB313', {
                    defaultValue:
                      'Reinforcement per ASME B31.3 §304.3.3 using the pressure design thickness of §304.1.2. Mill tolerance is applied to the as-supplied wall (Th,min, Tb,min), not treated as a required thickness. Cut-template geometry is independent of the reinforcement check.',
                  })}
                </p>
              </>
            )}
          </>
        )}
      </div>
        </>
      )}
    </div>
  );
}

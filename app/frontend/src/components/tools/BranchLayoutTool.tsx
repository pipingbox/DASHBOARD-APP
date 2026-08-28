import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { SCHEDULE_WT } from '@/tools/data/elbowData';

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

/* ─── Intersection profile computation ─── */
function computeIntersection(dHeader: number, dBranch: number, angleDeg: number, divisions: number) {
  const rHeader = dHeader / 2;
  const rBranch = dBranch / 2;
  const angleRad = (angleDeg * Math.PI) / 180;
  const tanAngle = Math.tan(angleRad);
  const points: { i: number; angleDeg: number; x: number; y: number; h: number }[] = [];

  for (let i = 0; i <= divisions; i++) {
    const theta = (i * 2 * Math.PI) / divisions;
    const thetaDeg = (i * 360) / divisions;
    const x = rBranch * Math.cos(theta);
    const y = rBranch * Math.sin(theta);
    const term1 = tanAngle !== 0 ? x / tanAngle : 0;
    const term2 = Math.sqrt(Math.max(0, rHeader * rHeader - y * y));
    const term3 = Math.sqrt(Math.max(0, rHeader * rHeader - rBranch * rBranch * Math.sin(theta) * Math.sin(theta)));
    const h = term1 + term2 - term3;
    points.push({ i, angleDeg: thetaDeg, x, y, h });
  }
  return points;
}

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

/* ─── Component ─── */
export default function BranchLayoutTool() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);

  const [headerNPS, setHeaderNPS] = useState('6"');
  const [branchNPS, setBranchNPS] = useState('3"');
  const [headerSch, setHeaderSch] = useState('40');
  const [branchSch, setBranchSch] = useState('40');
  const [angle, setAngle] = useState(90);
  const [divisions, setDivisions] = useState<number>(24);

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

  const headerSchOptions = getSchedulesForNPS(headerNPS);
  const branchSchOptions = getSchedulesForNPS(branchNPS);

  const isValid = headerOD > branchOD && headerWT > 0 && branchWT > 0 && angle >= 15 && angle <= 90;

  const designInputsValid =
    pressure > 0 && allowableStress > 0 && qualityFactor > 0 && weldStrengthFactor > 0 &&
    corrosion >= 0 && millTolerancePct >= 0 && millTolerancePct < 100;

  const points = useMemo(() => {
    if (!isValid) return [];
    return computeIntersection(headerOD, branchOD, angle, divisions);
  }, [headerOD, branchOD, angle, divisions, isValid]);

  const reinforcement = useMemo(() => {
    if (!isValid || !designInputsValid) return null;
    return calcReinforcement({
      headerOD, headerWT, branchOD, branchWT, angleDeg: angle,
      pressure, allowableStress, qualityFactor, weldStrengthFactor,
      coefficientY, corrosion, millTolerance: millTolerancePct / 100,
      weldLegBranch, weldLegPad, padThickness, padOD,
    });
  }, [
    headerOD, headerWT, branchOD, branchWT, angle, isValid, designInputsValid,
    pressure, allowableStress, qualityFactor, weldStrengthFactor, coefficientY,
    corrosion, millTolerancePct, weldLegBranch, weldLegPad, padThickness, padOD,
  ]);

  const perimeter = useMemo(() => branchOD * Math.PI, [branchOD]);

  const handleSave = async () => {
    if (!user || points.length === 0) return;
    await supabase.from(TABLES.toolUsage).insert({
      user_id: user.id,
      tool_name: 'Branch Connection Calculator',
      tool_category: 'Fabrication',
      input_data: {
        headerNPS, branchNPS, headerSch, branchSch, angle, divisions,
        pressure, allowableStress, qualityFactor, weldStrengthFactor,
        coefficientY, corrosion, millTolerancePct,
        weldLegBranch, weldLegPad, padThickness, padOD,
      },
      output_data: { reinforcement, perimeter: perimeter.toFixed(2) },
    });
    toast.success(t('tools.calculationSaved'));
  };

  const handlePrint = () => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Branch Connection Template - 1:1</title>
      <style>@page{size:landscape;margin:10mm}body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#fff}svg{max-width:100%;height:auto}.info{font-family:monospace;font-size:11px;margin:10px;color:#333}</style>
      </head><body>
      <div class="info">Header: ${headerNPS} Sch ${headerSch} (OD ${headerOD}mm, WT ${headerWT}mm) | Branch: ${branchNPS} Sch ${branchSch} (OD ${branchOD}mm, WT ${branchWT}mm) | Angle: ${angle}°</div>
      ${svgData}
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  // SVG dimensions for flat pattern
  const svgWidth = 700;
  const svgHeight = 320;
  const padding = 50;
  const plotW = svgWidth - padding * 2;
  const plotH = svgHeight - padding * 2;

  const maxH = points.length > 0 ? Math.max(...points.map(p => p.h)) : 1;
  const minH = points.length > 0 ? Math.min(...points.map(p => p.h)) : 0;
  const hRange = maxH - minH || 1;

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, idx) => {
      const px = padding + (idx / divisions) * plotW;
      const py = padding + plotH - ((p.h - minH) / hRange) * plotH;
      return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');
  }, [points, divisions, plotW, plotH, minH, hRange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.branchLayout.name')}
        </p>
        <h3 className="mt-1 text-xl font-semibold">{t('tools.branchLayout.subtitle')}</h3>
        <p className="mt-1 text-xs text-zinc-500">{t('tools.branchLayout.description')}</p>
      </div>

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

        {/* Branch Pipe */}
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
              {NPS_OPTIONS.filter(o => o.od < headerOD).map(o => (
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
            <span>ID: <span className="text-zinc-200">{(branchOD - 2 * branchWT).toFixed(1)} mm</span></span>
          </div>
        </div>

        {/* Parameters */}
        <div className="space-y-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
            {t('tools.branchLayout.parameters')}
          </p>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-500">{t('tools.branchLayout.angle')} (15°–90°)</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={15} max={90} step={1}
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value))}
                className="flex-1 accent-[#f59e0b]"
              />
              <span className="w-12 text-right text-sm font-mono text-[#f59e0b]">{angle}°</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-500">{t('tools.branchLayout.divisions')}</Label>
            <select
              value={divisions}
              onChange={(e) => setDivisions(Number(e.target.value))}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-[#f59e0b]"
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={36}>36</option>
              <option value={48}>48</option>
            </select>
          </div>
          <div className="pt-2 text-xs text-zinc-500">
            {t('tools.branchLayout.perimeterAxis')}: <span className="text-zinc-200 font-mono">{perimeter.toFixed(1)} mm</span>
          </div>
        </div>
      </div>

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
      {isValid && !designInputsValid && (
        <div className="border-l-2 border-red-500 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">
            {t('tools.branchLayout.errorDesignInputs', {
              defaultValue: 'Enter a positive design pressure P, allowable stress S, and factors E and W greater than zero.',
            })}
          </p>
        </div>
      )}

      {!isValid && headerOD > 0 && branchOD > 0 && (
        <div className="border-l-2 border-red-500 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">
            {headerOD <= branchOD
              ? t('tools.branchLayout.errorHeaderSmaller')
              : t('tools.branchLayout.errorInvalidParams')}
          </p>
        </div>
      )}

      {isValid && reinforcement && (
        <>
          {/* Results Panel */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* d1 — effective material removed */}
            <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                {t('tools.branchLayout.d1Label', { defaultValue: 'd1 — Material Removed' })}
              </p>
              <p className="mt-1 text-2xl font-bold text-[#f59e0b] font-mono">{reinforcement.d1.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500">mm</p>
            </div>
            {/* A1 — required */}
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                {t('tools.branchLayout.a1Required', { defaultValue: 'A1 — Required Area' })}
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-100 font-mono">{reinforcement.a1.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500">mm²</p>
            </div>
            {/* Available */}
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                {t('tools.branchLayout.availableArea', { defaultValue: 'Available Area' })}
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-100 font-mono">{reinforcement.aAvailable.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500">mm² (A2 + A3 + A4)</p>
            </div>
            {/* Acceptance */}
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

            {/* Thicknesses */}
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

            {/* Zone geometry */}
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

            {/* Areas */}
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

          {/* Cross-Section SVG */}
          <div className="border border-zinc-800/80 bg-zinc-950 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
              {t('tools.branchLayout.crossSection')}
            </p>
            <svg width="400" height="260" viewBox="0 0 400 260" className="mx-auto">
              {/* Header pipe cross-section */}
              <rect x="40" y="140" width="320" height={Math.max(20, headerWT * 2)} rx="2"
                fill="none" stroke="#666" strokeWidth="1.5" />
              <rect x="40" y={140 + Math.max(20, headerWT * 2)} width="320" height="4"
                fill="#333" stroke="none" />
              {/* Header wall fill */}
              <rect x="40" y="140" width="320" height={Math.min(headerWT * 0.8, 15)} rx="1"
                fill="#444" stroke="none" opacity="0.5" />

              {/* Hole in header */}
              {(() => {
                const holeW = Math.min(reinforcement.d1 * 0.8, 120);
                const cx = 200;
                return (
                  <g>
                    <rect x={cx - holeW / 2} y="135" width={holeW} height={Math.max(20, headerWT * 2) + 10}
                      fill="#0a0a0a" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,2" />
                    {/* Dimension line for hole */}
                    <line x1={cx - holeW / 2} y1="125" x2={cx + holeW / 2} y2="125" stroke="#f59e0b" strokeWidth="0.8" />
                    <line x1={cx - holeW / 2} y1="122" x2={cx - holeW / 2} y2="128" stroke="#f59e0b" strokeWidth="0.8" />
                    <line x1={cx + holeW / 2} y1="122" x2={cx + holeW / 2} y2="128" stroke="#f59e0b" strokeWidth="0.8" />
                    <text x={cx} y="121" textAnchor="middle" fill="#f59e0b" fontSize="9">
                      Ø{reinforcement.d1.toFixed(1)}
                    </text>
                  </g>
                );
              })()}

              {/* Branch pipe */}
              {(() => {
                const bw = Math.min(branchOD * 0.5, 60);
                const cx = 200;
                const angleRad = ((90 - angle) * Math.PI) / 180;
                const dx = Math.sin(angleRad) * 80;
                return (
                  <g>
                    <line x1={cx - bw / 2 + dx} y1="30" x2={cx - bw / 2} y2="140" stroke="#f59e0b" strokeWidth="1.5" />
                    <line x1={cx + bw / 2 + dx} y1="30" x2={cx + bw / 2} y2="140" stroke="#f59e0b" strokeWidth="1.5" />
                    <ellipse cx={cx + dx / 2} cy="30" rx={bw / 2} ry={bw / 6} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                    {/* Angle arc */}
                    {angle < 90 && (
                      <path
                        d={`M ${cx + 40} 140 A 40 40 0 0 0 ${cx + 40 * Math.cos(angleRad)} ${140 - 40 * Math.sin(angleRad)}`}
                        fill="none" stroke="#999" strokeWidth="0.8" strokeDasharray="2,2"
                      />
                    )}
                    <text x={cx + 50} y="138" fill="#999" fontSize="8">{angle}°</text>
                  </g>
                );
              })()}

              {/* Reinforcement pad */}
              {reinforcement.padRequired && (() => {
                const padW = Math.min(reinforcement.reqPadOD * 0.6, 140);
                const padH = Math.min(reinforcement.reqPadThickness * 1.5, 12);
                const cx = 200;
                return (
                  <g>
                    <rect x={cx - padW / 2} y={140 - padH} width={padW} height={padH} rx="1"
                      fill="#f59e0b" fillOpacity="0.15" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,2" />
                    <text x={cx + padW / 2 + 5} y={140 - padH / 2 + 3} fill="#f59e0b" fontSize="8">
                      PAD {reinforcement.reqPadThickness}mm
                    </text>
                  </g>
                );
              })()}

              {/* Labels */}
              <text x="20" y="155" fill="#666" fontSize="8" textAnchor="middle">
                {headerNPS}
              </text>
              <text x="200" y="250" fill="#666" fontSize="9" textAnchor="middle">
                {t('tools.branchLayout.headerPipe')}: {headerNPS} Sch {headerSch}
              </text>
              <text x="200" y="20" fill="#f59e0b" fontSize="9" textAnchor="middle">
                {t('tools.branchLayout.branchPipe')}: {branchNPS} Sch {branchSch}
              </text>
            </svg>
          </div>

          {/* Flat Pattern SVG (Saddle Profile) */}
          <div className="border border-zinc-800/80 bg-zinc-950 p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {t('tools.branchLayout.flatPattern')}
              </p>
              <span className="text-[9px] text-zinc-600">{t('tools.branchLayout.saddleProfile')}</span>
            </div>
            <svg ref={svgRef} width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full max-w-[700px]" style={{ background: '#0a0a0a' }}>
              {/* Grid lines */}
              {Array.from({ length: 5 }).map((_, i) => {
                const yPos = padding + (i / 4) * plotH;
                const val = (maxH - (i / 4) * hRange).toFixed(1);
                return (
                  <g key={`grid-h-${i}`}>
                    <line x1={padding} y1={yPos} x2={svgWidth - padding} y2={yPos} stroke="#222" strokeWidth="0.5" strokeDasharray="4,4" />
                    <text x={padding - 8} y={yPos + 4} textAnchor="end" fill="#555" fontSize="9">{val}</text>
                  </g>
                );
              })}
              {/* Vertical grid at key angles */}
              {[0, 90, 180, 270, 360].map((deg) => {
                const xPos = padding + (deg / 360) * plotW;
                return (
                  <g key={`grid-v-${deg}`}>
                    <line x1={xPos} y1={padding} x2={xPos} y2={svgHeight - padding} stroke="#222" strokeWidth="0.5" strokeDasharray="4,4" />
                    <text x={xPos} y={svgHeight - padding + 15} textAnchor="middle" fill="#555" fontSize="9">{deg}°</text>
                  </g>
                );
              })}

              {/* Filled area under curve */}
              {pathD && (
                <path
                  d={`${pathD} L${(padding + plotW).toFixed(1)},${(padding + plotH).toFixed(1)} L${padding},${(padding + plotH).toFixed(1)} Z`}
                  fill="#f59e0b" fillOpacity="0.08" stroke="none"
                />
              )}

              {/* Cut line path */}
              <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

              {/* Division points */}
              {points.map((p, idx) => {
                const px = padding + (idx / divisions) * plotW;
                const py = padding + plotH - ((p.h - minH) / hRange) * plotH;
                return <circle key={idx} cx={px} cy={py} r="2" fill="#f59e0b" opacity="0.7" />;
              })}

              {/* Min/Max markers */}
              {points.length > 0 && (() => {
                const maxPt = points.reduce((a, b) => a.h > b.h ? a : b);
                const minPt = points.reduce((a, b) => a.h < b.h ? a : b);
                const maxPx = padding + (maxPt.i / divisions) * plotW;
                const maxPy = padding + plotH - ((maxPt.h - minH) / hRange) * plotH;
                const minPx = padding + (minPt.i / divisions) * plotW;
                const minPy = padding + plotH - ((minPt.h - minH) / hRange) * plotH;
                return (
                  <>
                    <circle cx={maxPx} cy={maxPy} r="4" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                    <text x={maxPx} y={maxPy - 8} textAnchor="middle" fill="#f59e0b" fontSize="8">
                      max {maxPt.h.toFixed(1)}
                    </text>
                    <circle cx={minPx} cy={minPy} r="4" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                    <text x={minPx} y={minPy + 14} textAnchor="middle" fill="#22c55e" fontSize="8">
                      min {minPt.h.toFixed(1)}
                    </text>
                  </>
                );
              })()}

              {/* Axes labels */}
              <text x={svgWidth / 2} y={svgHeight - 5} textAnchor="middle" fill="#888" fontSize="10">
                {t('tools.branchLayout.perimeterAxis')} ({perimeter.toFixed(1)} mm)
              </text>
              <text x={14} y={svgHeight / 2} textAnchor="middle" fill="#888" fontSize="10" transform={`rotate(-90,14,${svgHeight / 2})`}>
                h (mm)
              </text>

              {/* Title block */}
              <text x={svgWidth - padding} y={padding - 10} textAnchor="end" fill="#666" fontSize="9">
                {headerNPS} × {branchNPS} @ {angle}°
              </text>
            </svg>
          </div>

          {/* Isometric 3D Preview */}
          <div className="border border-zinc-800/80 bg-zinc-950 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
              {t('tools.branchLayout.isometricView')}
            </p>
            <svg width="300" height="220" viewBox="0 0 300 220" className="mx-auto">
              {/* Header pipe (horizontal) */}
              <ellipse cx="150" cy="160" rx="100" ry="22" fill="none" stroke="#555" strokeWidth="1.5" />
              <line x1="50" y1="160" x2="50" y2="125" stroke="#555" strokeWidth="1.5" />
              <line x1="250" y1="160" x2="250" y2="125" stroke="#555" strokeWidth="1.5" />
              <ellipse cx="150" cy="125" rx="100" ry="22" fill="none" stroke="#777" strokeWidth="1.5" />
              {/* Center line header */}
              <line x1="30" y1="142" x2="270" y2="142" stroke="#333" strokeWidth="0.5" strokeDasharray="8,4" />

              {/* Branch pipe */}
              {(() => {
                const angleRad = ((90 - angle) * Math.PI) / 180;
                const bw = 30;
                const topY = 25;
                const botY = 125;
                const dx = Math.sin(angleRad) * (botY - topY);
                return (
                  <g>
                    <line x1={150 - bw / 2 + dx} y1={topY} x2={150 - bw / 2} y2={botY} stroke="#f59e0b" strokeWidth="1.5" />
                    <line x1={150 + bw / 2 + dx} y1={topY} x2={150 + bw / 2} y2={botY} stroke="#f59e0b" strokeWidth="1.5" />
                    <ellipse cx={150 + dx / 2} cy={topY} rx={bw / 2} ry={bw / 5} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                    {/* Intersection ellipse */}
                    <ellipse cx="150" cy={botY + 5} rx={bw / 2} ry={12} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3,2" />
                  </g>
                );
              })()}

              {/* Reinforcement pad ring */}
              {reinforcement.padRequired && (
                <ellipse cx="150" cy="128" rx="45" ry="14" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
              )}

              {/* Labels */}
              <text x="260" y="145" fill="#555" fontSize="9">Ø{headerOD}</text>
              <text x="185" y="60" fill="#f59e0b" fontSize="9">Ø{branchOD}</text>
              <text x="150" y="210" textAnchor="middle" fill="#666" fontSize="8">{angle}°</text>
              {reinforcement.padRequired && (
                <text x="200" y="120" fill="#f59e0b" fontSize="7" opacity="0.7">PAD</text>
              )}
            </svg>
          </div>

          {/* Dimension Table */}
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
                    <th className="py-1.5 px-2 text-left text-zinc-400">h (mm)</th>
                    <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.distFromRef')}</th>
                    <th className="py-1.5 px-2 text-left text-zinc-400">{t('tools.branchLayout.arcLength')}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1 px-2 text-zinc-500">{p.i}</td>
                      <td className="py-1 px-2 text-zinc-300">{p.angleDeg.toFixed(1)}°</td>
                      <td className="py-1 px-2 text-[#f59e0b] font-mono">{p.h.toFixed(2)}</td>
                      <td className="py-1 px-2 text-zinc-300 font-mono">{(p.h - minH).toFixed(2)}</td>
                      <td className="py-1 px-2 text-zinc-400 font-mono">{((p.i / divisions) * perimeter).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={handlePrint} className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
              {t('tools.branchLayout.print1to1')}
            </Button>
            <Button onClick={handleSave} variant="outline" className="border-zinc-700 !bg-transparent hover:!bg-zinc-900">
              {t('tools.branchLayout.saveCalc')}
            </Button>
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
    </div>
  );
}
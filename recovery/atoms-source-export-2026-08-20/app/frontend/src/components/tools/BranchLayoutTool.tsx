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

/* ─── ASME B31.3 Reinforcement Calculation ─── */
interface ReinforcementResult {
  dHole: number;         // Hole diameter in header (mm)
  aRequired: number;     // Required reinforcement area (mm²)
  a1: number;            // Area from excess header wall (mm²)
  a2: number;            // Area from excess branch wall (mm²)
  aAvailable: number;    // Total available area (mm²)
  padRequired: boolean;  // Whether a reinforcement pad is needed
  padThickness: number;  // Minimum pad thickness (mm)
  padWidth: number;      // Pad width along header (mm)
  padOD: number;         // Pad outer diameter (mm)
}

function calcReinforcement(
  headerOD: number, headerWT: number,
  branchOD: number, branchWT: number,
  angleDeg: number
): ReinforcementResult {
  const angleRad = (angleDeg * Math.PI) / 180;
  const sinAngle = Math.sin(angleRad);

  // d = (Db - 2*Tb) / sin(angle) — effective hole diameter
  const branchID = branchOD - 2 * branchWT;
  const dHole = branchID / sinAngle;

  // Required reinforcement area: A_req = d * Th * F (F=1 for internal pressure)
  const F = 1.0;
  const aRequired = dHole * headerWT * F;

  // A1: excess in header wall within reinforcement zone
  // Zone width = d (on each side of hole center)
  const a1 = (2 * dHole - branchID / sinAngle) * (headerWT - headerWT) ; // Simplified: using nominal = min required
  // For simplicity with nominal thickness: A1 = d * (T - t_required)
  // Since we use nominal as both, A1 comes from the extra material in the zone
  // More practical: A1 = (E1*T - F*t_req*d) but with t_req = T (no corrosion), A1 ≈ 0
  // Real calculation: A1 = larger of (Th - tr)*d or (Th - tr)*(Tb + Th + d/2)
  // Using conservative approach where tr = Th (no excess in header for nominal calc)
  const tr_header = headerWT; // Required thickness = nominal (conservative)
  const actualA1 = Math.max(0, (headerWT - tr_header * 0.875) * dHole * 2);

  // A2: excess in branch wall within reinforcement zone height
  // Height of zone = min(2.5*Th, 2.5*Tb + tr)
  const L4 = Math.min(2.5 * headerWT, 2.5 * branchWT);
  const tr_branch = branchWT; // Required thickness for branch
  const actualA2 = Math.max(0, 2 * L4 * (branchWT - tr_branch * 0.875) / sinAngle);

  const aAvailable = actualA1 + actualA2;
  const padRequired = aAvailable < aRequired;

  // Pad sizing
  let padThickness = 0;
  let padWidth = 0;
  let padOD = 0;

  if (padRequired) {
    const deficit = aRequired - aAvailable;
    // Pad width limited to: d or (Tb + Th + d/2) on each side
    padWidth = Math.min(dHole, branchOD);
    padThickness = Math.ceil(deficit / padWidth * 10) / 10; // Round up to 0.1mm
    padThickness = Math.max(padThickness, headerWT); // Minimum = header wall thickness
    padOD = branchOD + 2 * padWidth;
  }

  return {
    dHole: Math.round(dHole * 100) / 100,
    aRequired: Math.round(aRequired * 100) / 100,
    a1: Math.round(actualA1 * 100) / 100,
    a2: Math.round(actualA2 * 100) / 100,
    aAvailable: Math.round(aAvailable * 100) / 100,
    padRequired,
    padThickness: Math.round(padThickness * 100) / 100,
    padWidth: Math.round(padWidth * 100) / 100,
    padOD: Math.round(padOD * 100) / 100,
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

  // Derived values
  const headerOD = NPS_OPTIONS.find(o => o.label === headerNPS)?.od ?? 168.3;
  const branchOD = NPS_OPTIONS.find(o => o.label === branchNPS)?.od ?? 88.9;
  const headerWT = getWT(headerNPS, headerSch);
  const branchWT = getWT(branchNPS, branchSch);

  const headerSchOptions = getSchedulesForNPS(headerNPS);
  const branchSchOptions = getSchedulesForNPS(branchNPS);

  const isValid = headerOD > branchOD && headerWT > 0 && branchWT > 0 && angle >= 15 && angle <= 90;

  const points = useMemo(() => {
    if (!isValid) return [];
    return computeIntersection(headerOD, branchOD, angle, divisions);
  }, [headerOD, branchOD, angle, divisions, isValid]);

  const reinforcement = useMemo(() => {
    if (!isValid) return null;
    return calcReinforcement(headerOD, headerWT, branchOD, branchWT, angle);
  }, [headerOD, headerWT, branchOD, branchWT, angle, isValid]);

  const perimeter = useMemo(() => branchOD * Math.PI, [branchOD]);

  const handleSave = async () => {
    if (!user || points.length === 0) return;
    await supabase.from(TABLES.toolUsage).insert({
      user_id: user.id,
      tool_name: 'Branch Connection Calculator',
      tool_category: 'Fabrication',
      input_data: { headerNPS, branchNPS, headerSch, branchSch, angle, divisions },
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

      {/* Validation error */}
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
            {/* Hole Size */}
            <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.holeSize')}</p>
              <p className="mt-1 text-2xl font-bold text-[#f59e0b] font-mono">{reinforcement.dHole.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500">mm Ø</p>
            </div>
            {/* Required Area */}
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.areaRequired')}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100 font-mono">{reinforcement.aRequired.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500">mm²</p>
            </div>
            {/* Available Area */}
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.areaAvailable')}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100 font-mono">{reinforcement.aAvailable.toFixed(1)}</p>
              <p className="text-[10px] text-zinc-500">mm² (A1 + A2)</p>
            </div>
            {/* Pad Status */}
            <div className={`rounded-lg border p-4 text-center ${reinforcement.padRequired ? 'border-red-500/40 bg-red-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`}>
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">{t('tools.branchLayout.reinforcementPad')}</p>
              <p className={`mt-1 text-lg font-bold ${reinforcement.padRequired ? 'text-red-400' : 'text-emerald-400'}`}>
                {reinforcement.padRequired ? t('tools.branchLayout.padRequired') : t('tools.branchLayout.padNotRequired')}
              </p>
              {reinforcement.padRequired && (
                <p className="text-[10px] text-zinc-400 mt-1">
                  {reinforcement.padThickness} mm × Ø{reinforcement.padOD.toFixed(0)} mm
                </p>
              )}
            </div>
          </div>

          {/* Reinforcement Detail (ASME B31.3) */}
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
                {t('tools.branchLayout.reinforcementCalc')}
              </p>
              <span className="text-[9px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">ASME B31.3 §304.3.3</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-zinc-500">d (hole):</span>
                <span className="ml-1 text-zinc-200 font-mono">{reinforcement.dHole} mm</span>
              </div>
              <div>
                <span className="text-zinc-500">A<sub>req</sub>:</span>
                <span className="ml-1 text-zinc-200 font-mono">{reinforcement.aRequired} mm²</span>
              </div>
              <div>
                <span className="text-zinc-500">A<sub>1</sub> (header):</span>
                <span className="ml-1 text-zinc-200 font-mono">{reinforcement.a1} mm²</span>
              </div>
              <div>
                <span className="text-zinc-500">A<sub>2</sub> (branch):</span>
                <span className="ml-1 text-zinc-200 font-mono">{reinforcement.a2} mm²</span>
              </div>
            </div>
            {reinforcement.padRequired && (
              <div className="mt-3 pt-3 border-t border-zinc-800/60 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500">{t('tools.branchLayout.padThickness')}:</span>
                  <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.padThickness} mm</span>
                </div>
                <div>
                  <span className="text-zinc-500">{t('tools.branchLayout.padOD')}:</span>
                  <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.padOD.toFixed(1)} mm</span>
                </div>
                <div>
                  <span className="text-zinc-500">{t('tools.branchLayout.padWidth')}:</span>
                  <span className="ml-1 text-[#f59e0b] font-mono">{reinforcement.padWidth.toFixed(1)} mm</span>
                </div>
              </div>
            )}
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
                const holeW = Math.min(reinforcement.dHole * 0.8, 120);
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
                      Ø{reinforcement.dHole.toFixed(1)}
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
                const padW = Math.min(reinforcement.padOD * 0.6, 140);
                const padH = Math.min(reinforcement.padThickness * 1.5, 12);
                const cx = 200;
                return (
                  <g>
                    <rect x={cx - padW / 2} y={140 - padH} width={padW} height={padH} rx="1"
                      fill="#f59e0b" fillOpacity="0.15" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,2" />
                    <text x={cx + padW / 2 + 5} y={140 - padH / 2 + 3} fill="#f59e0b" fontSize="8">
                      PAD {reinforcement.padThickness}mm
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
            {t('tools.branchLayout.referenceNote')}
          </p>
        </>
      )}
    </div>
  );
}
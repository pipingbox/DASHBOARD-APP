import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// FEAT-001: Elbow Cut Calculator v2.0
// Calculates where to cut a standard 90° elbow to obtain a smaller angle.
// SVG diagram in professional manual style with 3 colored arcs, cut line, and dimensions.

interface NpsEntry { nps: string; od: number; }

const NPS_OD: NpsEntry[] = [
  { nps: '1/2"', od: 21.3 }, { nps: '3/4"', od: 26.7 }, { nps: '1"', od: 33.4 },
  { nps: '1-1/4"', od: 42.2 }, { nps: '1-1/2"', od: 48.3 }, { nps: '2"', od: 60.3 },
  { nps: '2-1/2"', od: 73.0 }, { nps: '3"', od: 88.9 }, { nps: '4"', od: 114.3 },
  { nps: '5"', od: 141.3 }, { nps: '6"', od: 168.3 }, { nps: '8"', od: 219.1 },
  { nps: '10"', od: 273.0 }, { nps: '12"', od: 323.8 }, { nps: '14"', od: 355.6 },
  { nps: '16"', od: 406.4 }, { nps: '18"', od: 457.0 }, { nps: '20"', od: 508.0 },
  { nps: '24"', od: 609.6 },
];

const SCHEDULES = ['Sch 10', 'Sch 40/STD', 'Sch 80/XS', 'Sch 160', 'XXS'];

const FIXED_ANGLES = [5, 10, 15, 20, 25, 30, 45, 60, 75, 90];

function npsToNumeric(nps: string): number {
  if (nps.includes('-')) {
    const [a, b] = nps.replace('"', '').split('-').map(Number);
    return a + b;
  }
  return parseFloat(nps.replace('"', ''));
}

function calculateCut(od: number, nps: string, radiusType: 'LR' | 'SR', angleDeg: number) {
  const npsNum = npsToNumeric(nps);
  const R = radiusType === 'LR' ? 1.5 * npsNum * 25.4 : 1.0 * npsNum * 25.4; // mm
  const rad = (angleDeg * Math.PI) / 180;
  const halfRad = rad / 2;

  const cutIntradors = (R - od / 2) * Math.tan(halfRad);
  const cutExtradors = (R + od / 2) * Math.tan(halfRad);
  const arcNeutral = R * rad;
  const arcExtradors = (R + od / 2) * rad;
  const arcIntradors = (R - od / 2) * rad;

  return {
    R,
    cutIntradors: Math.max(0, cutIntradors),
    cutExtradors: Math.max(0, cutExtradors),
    arcNeutral,
    arcExtradors,
    arcIntradors,
  };
}

export default function ElbowCut({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [nps, setNps] = useState('6');
  const [schedule, setSchedule] = useState('Sch 40/STD');
  const [radiusType, setRadiusType] = useState<'LR' | 'SR'>('LR');
  const [angle, setAngle] = useState('45');

  // Visibility toggles
  const [showCenter, setShowCenter] = useState(true);
  const [showCutLine, setShowCutLine] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showFill, setShowFill] = useState(true);

  const od = NPS_OD.find((n) => n.nps === nps)?.od ?? 168.3;
  const angleNum = Math.min(90, Math.max(0, parseFloat(angle) || 0));
  const valid = angleNum > 0 && angleNum < 90;

  const result = useMemo(() => {
    if (!valid) return null;
    return calculateCut(od, nps, radiusType, angleNum);
  }, [od, nps, radiusType, angleNum, valid]);

  const fixedResults = useMemo(() => {
    return FIXED_ANGLES.map((a) => ({ angle: a, ...calculateCut(od, nps, radiusType, a) }));
  }, [od, nps, radiusType]);

  // SVG geometry
  const R = radiusType === 'LR' ? 1.5 * npsToNumeric(nps) * 25.4 : 1.0 * npsToNumeric(nps) * 25.4;
  const halfOd = od / 2;
  const svgSize = 400;
  const cx = svgSize / 2;
  const cy = svgSize - 60;
  const scale = Math.min(1, 140 / R);

  // Arc paths (90° elbow from 0° to 90°)
  // Extradós (outer): R + halfOd
  // Neutral (center): R
  // Intradós (inner): R - halfOd
  const rExt = (R + halfOd) * scale;
  const rNeu = R * scale;
  const rInt = Math.max(0, (R - halfOd)) * scale;

  // Arc from 0° (right) to 90° (top)
  function arcPath(radius: number, startDeg: number, endDeg: number): string {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy - radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy - radius * Math.sin(endRad);
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweep = startDeg < endDeg ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  // Cut line at angleNum
  const cutRad = (angleNum * Math.PI) / 180;
  const cutX1 = cx + rInt * Math.cos(cutRad);
  const cutY1 = cy - rInt * Math.sin(cutRad);
  const cutX2 = cx + rExt * Math.cos(cutRad);
  const cutY2 = cy - rExt * Math.sin(cutRad);

  const fmt = (n: number, d = 2) => (isFinite(n) ? n.toFixed(d) : '—');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.elbowCut', { defaultValue: 'Elbow Cut Calculator' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.elbowCutSubtitle', { defaultValue: 'ASME B16.9 · Cut angles for 90° elbows' })}
        </h3>
      </div>

      <Tabs defaultValue="calculator">
        <TabsList className="bg-zinc-950 border border-zinc-800">
          <TabsTrigger value="calculator">{t('tools.tabCalculator', { defaultValue: 'Calculator' })}</TabsTrigger>
          <TabsTrigger value="formulas">{t('tools.tabFormulas', { defaultValue: 'Formulas & Notes' })}</TabsTrigger>
        </TabsList>

        {/* ─── Calculator Tab ─── */}
        <TabsContent value="calculator" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Inputs + Table */}
            <div className="space-y-4">
              {/* Inputs */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">NPS</Label>
                  <Select value={nps} onValueChange={setNps}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NPS_OD.map((n) => <SelectItem key={n.nps} value={n.nps}>{n.nps} (OD {n.od}mm)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">Schedule</Label>
                  <Select value={schedule} onValueChange={setSchedule}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCHEDULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">Radius Type</Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRadiusType('LR')}
                      className={`flex-1 rounded-sm border px-3 py-2 text-xs transition ${radiusType === 'LR' ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]' : 'border-zinc-800 bg-zinc-950 text-zinc-300'}`}
                    >
                      Long (1.5D)
                    </button>
                    <button
                      onClick={() => setRadiusType('SR')}
                      className={`flex-1 rounded-sm border px-3 py-2 text-xs transition ${radiusType === 'SR' ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]' : 'border-zinc-800 bg-zinc-950 text-zinc-300'}`}
                    >
                      Short (1.0D)
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">Cut Angle (°)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="89"
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
                  />
                  <input
                    type="range"
                    min="1"
                    max="89"
                    value={Math.min(89, Math.max(1, angleNum))}
                    onChange={(e) => setAngle(e.target.value)}
                    className="w-full accent-[#f59e0b]"
                    aria-label="Cut angle"
                  />
                </div>
              </div>

              {/* Results */}
              {valid && result ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">Cut — Intradós</p>
                    <p className="mt-1 text-lg font-bold text-zinc-100">{fmt(result.cutIntradors)} mm</p>
                    <p className="text-[10px] text-zinc-500">{fmt(result.cutIntradors / 25.4, 3)} in</p>
                  </div>
                  <div className="border-l-2 border-[#22d3ee] bg-[#22d3ee]/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#22d3ee]">Cut — Extradós</p>
                    <p className="mt-1 text-lg font-bold text-zinc-100">{fmt(result.cutExtradors)} mm</p>
                    <p className="text-[10px] text-zinc-500">{fmt(result.cutExtradors / 25.4, 3)} in</p>
                  </div>
                </div>
              ) : angleNum === 0 ? (
                <p className="text-sm text-zinc-500">Enter an angle greater than 0°.</p>
              ) : angleNum >= 90 ? (
                <p className="text-sm text-zinc-500">Full 90° elbow — no cut needed.</p>
              ) : null}

              {/* Fixed angles table */}
              <div className="overflow-x-auto rounded-md border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Angle</th>
                      <th className="px-3 py-2 text-right">Cut Intradós (mm)</th>
                      <th className="px-3 py-2 text-right">Cut Extradós (mm)</th>
                      <th className="px-3 py-2 text-right">Arc Neutral (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedResults.map((r) => (
                      <tr
                        key={r.angle}
                        className={`border-t border-zinc-800/60 hover:bg-zinc-900/30 ${r.angle === angleNum ? 'bg-[#f59e0b]/5' : ''}`}
                      >
                        <td className="px-3 py-2 font-semibold text-zinc-100">{r.angle}°</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmt(r.cutIntradors)}</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmt(r.cutExtradors)}</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmt(r.arcNeutral)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: SVG Diagram */}
            <div className="space-y-3">
              {/* Visibility toggles */}
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-zinc-400">
                  <input type="checkbox" checked={showCenter} onChange={(e) => setShowCenter(e.target.checked)} className="accent-[#f59e0b]" />
                  Center
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400">
                  <input type="checkbox" checked={showCutLine} onChange={(e) => setShowCutLine(e.target.checked)} className="accent-[#f59e0b]" />
                  Cut line
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400">
                  <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} className="accent-[#f59e0b]" />
                  Dimensions
                </label>
                <label className="flex items-center gap-1.5 text-zinc-400">
                  <input type="checkbox" checked={showFill} onChange={(e) => setShowFill(e.target.checked)} className="accent-[#f59e0b]" />
                  Fill
                </label>
              </div>

              {/* SVG */}
              <div className="border border-zinc-800 bg-[#0d0d0d] p-4 rounded-sm">
                <svg
                  viewBox={`0 0 ${svgSize} ${svgSize}`}
                  className="w-full"
                  role="img"
                  aria-label={`90 degree elbow with cut line at ${angleNum} degrees`}
                >
                  {/* Fill */}
                  {showFill && rInt > 0 && (
                    <path
                      d={`${arcPath(rExt, 0, 90)} L ${cx} ${cy} Z`}
                      fill="#f59e0b"
                      fillOpacity="0.04"
                    />
                  )}

                  {/* Extradós (outer) — cyan */}
                  <path d={arcPath(rExt, 0, 90)} fill="none" stroke="#22d3ee" strokeWidth="2" />
                  {/* Neutral (center) — white dashed */}
                  {showCenter && (
                    <path d={arcPath(rNeu, 0, 90)} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.6" />
                  )}
                  {/* Intradós (inner) — orange */}
                  {rInt > 0 && (
                    <path d={arcPath(rInt, 0, 90)} fill="none" stroke="#f97316" strokeWidth="2" />
                  )}

                  {/* Center point */}
                  {showCenter && (
                    <>
                      <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
                      <text x={cx + 6} y={cy + 4} fill="#ffffff" fontSize="9">R: {R.toFixed(0)}mm</text>
                    </>
                  )}

                  {/* Cut line */}
                  {showCutLine && valid && (
                    <>
                      <line
                        x1={cutX1} y1={cutY1} x2={cutX2} y2={cutY2}
                        stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2"
                      />
                      <text
                        x={cx + (rExt + 15) * Math.cos(cutRad)}
                        y={cy - (rExt + 15) * Math.sin(cutRad)}
                        fill="#ef4444" fontSize="10" fontWeight="bold"
                        textAnchor="middle"
                      >
                        {angleNum}°
                      </text>
                    </>
                  )}

                  {/* Dimension labels */}
                  {showDimensions && (
                    <>
                      {/* OD label */}
                      <text x={cx + rExt + 8} y={cy - rExt / 2} fill="#22d3ee" fontSize="9">① OD: {od.toFixed(1)}mm</text>
                      {/* Center label */}
                      {showCenter && <text x={cx - rNeu - 50} y={cy - rNeu / 2} fill="#ffffff" fontSize="9" opacity="0.7">② Center</text>}
                      {/* Inner label */}
                      {rInt > 0 && <text x={cx + 5} y={cy - rInt - 5} fill="#f97316" fontSize="9">③ Intradós</text>}
                    </>
                  )}

                  {/* Axes (faint) */}
                  <line x1={cx - 10} y1={cy} x2={cx + rExt + 30} y2={cy} stroke="#27272a" strokeWidth="0.5" />
                  <line x1={cx} y1={cy + 10} x2={cx} y2={cy - rExt - 30} stroke="#27272a" strokeWidth="0.5" />
                </svg>
              </div>

              {/* Arc lengths */}
              {valid && result && (
                <div className="overflow-hidden rounded-md border border-zinc-800">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-zinc-800/60">
                        <td className="px-4 py-2 text-zinc-400">① Extradós arc</td>
                        <td className="px-4 py-2 text-right font-mono text-[#22d3ee]">{fmt(result.arcExtradors)} mm</td>
                      </tr>
                      <tr className="border-b border-zinc-800/60">
                        <td className="px-4 py-2 text-zinc-400">② Neutral arc</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-200">{fmt(result.arcNeutral)} mm</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-zinc-400">③ Intradós arc</td>
                        <td className="px-4 py-2 text-right font-mono text-[#f97316]">{fmt(result.arcIntradors)} mm</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ─── Formulas Tab ─── */}
        <TabsContent value="formulas" className="space-y-6">
          <div className="border border-zinc-800 bg-[#0d0d0d] p-5 rounded-sm space-y-4">
            <h4 className="text-sm font-semibold text-zinc-200">Formulas</h4>
            <div className="space-y-3 font-mono text-xs text-zinc-300">
              <div className="border-l-2 border-[#f59e0b] pl-3">
                <p className="text-[#f59e0b]">R (radius)</p>
                <p>LR: R = 1.5 × NPS × 25.4 mm</p>
                <p>SR: R = 1.0 × NPS × 25.4 mm</p>
              </div>
              <div className="border-l-2 border-[#f97316] pl-3">
                <p className="text-[#f97316]">Cut — Intradós (inner)</p>
                <p>cut_intradós = (R − OD/2) × tan(θ/2)</p>
              </div>
              <div className="border-l-2 border-[#22d3ee] pl-3">
                <p className="text-[#22d3ee]">Cut — Extradós (outer)</p>
                <p>cut_extradós = (R + OD/2) × tan(θ/2)</p>
              </div>
              <div className="border-l-2 border-zinc-600 pl-3">
                <p className="text-zinc-400">Arc lengths</p>
                <p>arc_neutral = R × θ(rad)</p>
                <p>arc_extradós = (R + OD/2) × θ(rad)</p>
                <p>arc_intradós = (R − OD/2) × θ(rad)</p>
              </div>
            </div>
          </div>

          <div className="border border-zinc-800 bg-[#0d0d0d] p-5 rounded-sm space-y-3">
            <h4 className="text-sm font-semibold text-zinc-200">Reference Notes</h4>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li>• <span className="text-zinc-300">LR</span> = Long Radius (1.5D), <span className="text-zinc-300">SR</span> = Short Radius (1.0D) per ASME B16.9.</li>
              <li>• Cut tolerance: ±2mm recommended for field fabrication.</li>
              <li>• The cut angle is measured from the end of the elbow (the 90° face).</li>
              <li>• For angles &lt; 30°, use a physical template for greater precision.</li>
              <li>• Always verify the OD with a caliper before marking the cut.</li>
              <li>• For welded joints, account for the gap (typically 2-3mm).</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

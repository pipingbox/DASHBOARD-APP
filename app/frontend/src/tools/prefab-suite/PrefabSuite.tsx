import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  NPS_OPTIONS,
  calculateOffsetWithElbows,
  calculateOffsetWithoutElbows,
  verifyOffset,
  type ElbowType,
  type OffsetWithElbowsResult,
  type OffsetWithoutElbowsResult,
  type OffsetVerifyResult,
} from './offsets';

// PB-027: Suite de Prefabricación
// Unified prefabrication suite: offsets with elbows, without elbows, verification.
// Future: PB-026 (pipe combs), PB-029 (mitered elbows).

const ANGLES = [22.5, 30, 45, 60];
const fmt = (n: number, d = 1) => (isFinite(n) ? n.toFixed(d) : '—');

function ResultCard({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  const color = accent ?? '#f59e0b';
  return (
    <div className="border-l-2 p-4" style={{ borderColor: color, backgroundColor: `${color}08` }}>
      <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color }}>{label}</p>
      <p className="mt-1 text-lg font-bold text-zinc-100">{value} <span className="text-xs font-normal text-zinc-500">{unit}</span></p>
    </div>
  );
}

// ─── SVG for offset with elbows ───
function OffsetSVG({ result, unit }: { result: OffsetWithElbowsResult; unit: 'mm' | 'in' }) {
  const w = 400, h = 320;
  const margin = 40;
  const toUnit = (v: number) => unit === 'in' ? v / 25.4 : v;
  const fmtU = (v: number) => fmt(toUnit(v), unit === 'in' ? 2 : 1);

  // Normalize to fit SVG
  const maxDim = Math.max(result.run, result.offset, 1);
  const scale = (Math.min(w, h) - margin * 2.5) / maxDim;

  const x0 = margin;
  const y0 = h - margin;
  const runPx = result.run * scale;
  const offsetPx = result.offset * scale;

  // Points: bottom-left run, then travel up-right, then top run
  const pA = { x: x0, y: y0 };                              // Start of bottom run
  const pB = { x: x0 + 60, y: y0 };                         // Bottom elbow
  const pC = { x: pB.x + runPx, y: pB.y - offsetPx };       // Top elbow
  const pD = { x: pC.x + 60, y: pC.y };                     // End of top run

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Offset diagram">
      {/* Bottom run */}
      <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#71717a" strokeWidth="3" />
      {/* Travel (inclined) */}
      <line x1={pB.x} y1={pB.y} x2={pC.x} y2={pC.y} stroke="#f59e0b" strokeWidth="3" />
      {/* Top run */}
      <line x1={pC.x} y1={pC.y} x2={pD.x} y2={pD.y} stroke="#71717a" strokeWidth="3" />

      {/* Elbow circles */}
      <circle cx={pB.x} cy={pB.y} r="6" fill="#f59e0b" stroke="#0d0d0d" strokeWidth="2" />
      <circle cx={pC.x} cy={pC.y} r="6" fill="#f59e0b" stroke="#0d0d0d" strokeWidth="2" />

      {/* Offset dimension (vertical) */}
      <line x1={pB.x - 20} y1={pB.y} x2={pB.x - 20} y2={pC.y} stroke="#22d3ee" strokeWidth="1" strokeDasharray="4 2" />
      <line x1={pB.x - 25} y1={pB.y} x2={pB.x - 15} y2={pB.y} stroke="#22d3ee" strokeWidth="1" />
      <line x1={pB.x - 25} y1={pC.y} x2={pB.x - 15} y2={pC.y} stroke="#22d3ee" strokeWidth="1" />
      <text x={pB.x - 28} y={(pB.y + pC.y) / 2 + 4} fill="#22d3ee" fontSize="10" textAnchor="end" fontWeight="bold">
        {fmtU(result.offset)} {unit}
      </text>

      {/* Run dimension (horizontal) */}
      <line x1={pB.x} y1={pB.y + 20} x2={pC.x} y2={pB.y + 20} stroke="#a78bfa" strokeWidth="1" strokeDasharray="4 2" />
      <text x={(pB.x + pC.x) / 2} y={pB.y + 35} fill="#a78bfa" fontSize="10" textAnchor="middle">
        Run: {fmtU(result.run)} {unit}
      </text>

      {/* Travel label on the inclined pipe */}
      <text
        x={(pB.x + pC.x) / 2 + 15}
        y={(pB.y + pC.y) / 2 - 8}
        fill="#f59e0b"
        fontSize="11"
        fontWeight="bold"
        textAnchor="middle"
        transform={`rotate(${-Math.atan2(offsetPx, runPx) * 180 / Math.PI}, ${(pB.x + pC.x) / 2 + 15}, ${(pB.y + pC.y) / 2 - 8})`}
      >
        Travel: {fmtU(result.travel)} {unit}
      </text>

      {/* Angle arc */}
      <path
        d={`M ${pB.x + 30} ${pB.y} A 30 30 0 0 0 ${pB.x + 30 * Math.cos(result.angle * Math.PI / 180)} ${pB.y - 30 * Math.sin(result.angle * Math.PI / 180)}`}
        fill="none" stroke="#f59e0b" strokeWidth="1.5"
      />
      <text x={pB.x + 38} y={pB.y - 12} fill="#f59e0b" fontSize="9">{result.angle}°</text>

      {/* Cut length label */}
      <text x={w / 2} y={25} fill="#22c55e" fontSize="11" textAnchor="middle" fontWeight="bold">
        ✂ Cut: {fmtU(result.cutLength)} {unit}
      </text>
    </svg>
  );
}

// ─── Offset With Elbows ───
function OffsetWithElbows({ t }: { t: (k: string, o?: Record<string, string>) => string }) {
  const [offset, setOffset] = useState('150');
  const [angle, setAngle] = useState('45');
  const [nps, setNps] = useState('6');
  const [elbowType, setElbowType] = useState<ElbowType>('90LR');
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');

  const offsetMm = parseFloat(offset) || 0;
  const angleDeg = parseFloat(angle) || 45;
  const valid = offsetMm > 0 && angleDeg > 0 && angleDeg < 90;

  const result = useMemo(() => {
    if (!valid) return null;
    return calculateOffsetWithElbows(offsetMm, angleDeg, nps, elbowType);
  }, [offsetMm, angleDeg, nps, elbowType, valid]);

  const toUnit = (v: number) => unit === 'in' ? v / 25.4 : v;
  const fmtU = (v: number) => fmt(toUnit(v), unit === 'in' ? 2 : 1);

  return (
    <div className="space-y-6">
      {/* Unit toggle */}
      <div className="flex justify-end gap-2">
        {(['mm', 'in'] as const).map((u) => (
          <button key={u} onClick={() => setUnit(u)}
            className={`rounded-sm border px-3 py-1 text-xs transition ${unit === u ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]' : 'border-zinc-800 text-zinc-400'}`}>
            {u}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.offset', { defaultValue: 'Offset' })} ({unit})
              </Label>
              <Input type="number" min="1" value={offset} onChange={(e) => setOffset(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.angle', { defaultValue: 'Angle' })} (°)
              </Label>
              <Select value={angle} onValueChange={setAngle}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANGLES.map((a) => <SelectItem key={a} value={String(a)}>{a}°</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">NPS</Label>
              <Select value={nps} onValueChange={setNps}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NPS_OPTIONS.map((n) => <SelectItem key={n} value={n}>{n}"</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.elbowType', { defaultValue: 'Elbow Type' })}
              </Label>
              <div className="flex gap-2">
                {(['90LR', '90SR', '45LR'] as ElbowType[]).map((et) => (
                  <button key={et} onClick={() => setElbowType(et)}
                    className={`flex-1 rounded-sm border px-2 py-2 text-xs transition ${elbowType === et ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]' : 'border-zinc-800 bg-zinc-950 text-zinc-300'}`}>
                    {et === '90LR' ? '90° LR' : et === '90SR' ? '90° SR' : '45° LR'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          {valid && result && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <ResultCard label={t('prefab.travel', { defaultValue: 'Travel' })} value={fmtU(result.travel)} unit={unit} />
                <ResultCard label={t('prefab.run', { defaultValue: 'Run' })} value={fmtU(result.run)} unit={unit} accent="#a78bfa" />
                <ResultCard label={t('prefab.cutLength', { defaultValue: 'Cut Length' })} value={fmtU(result.cutLength)} unit={unit} accent="#22c55e" />
                <ResultCard label={t('prefab.elbowAdvance', { defaultValue: 'Elbow Advance' })} value={fmtU(result.elbowAdvance)} unit={unit} accent="#22d3ee" />
                <ResultCard label={t('prefab.centerToCenter', { defaultValue: 'Center to Center' })} value={fmtU(result.centerToCenter)} unit={unit} accent="#f97316" />
              </div>

              {/* Quick reference table for all angles */}
              <div className="overflow-x-auto rounded-md border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('prefab.angle', { defaultValue: 'Angle' })}</th>
                      <th className="px-3 py-2 text-right">Travel</th>
                      <th className="px-3 py-2 text-right">Run</th>
                      <th className="px-3 py-2 text-right">{t('prefab.cutLength', { defaultValue: 'Cut' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ANGLES.map((a) => {
                      const r = calculateOffsetWithElbows(offsetMm, a, nps, elbowType);
                      return (
                        <tr key={a} className={`border-t border-zinc-800/60 hover:bg-zinc-900/30 ${a === angleDeg ? 'bg-[#f59e0b]/5' : ''}`}>
                          <td className="px-3 py-2 font-semibold text-zinc-100">{a}°</td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtU(r.travel)}</td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtU(r.run)}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#22c55e]">{fmtU(r.cutLength)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* SVG */}
        <div className="border border-zinc-800 bg-[#0d0d0d] p-4 rounded-sm">
          {valid && result ? (
            <OffsetSVG result={result} unit={unit} />
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-zinc-600">
              {t('prefab.enterValues', { defaultValue: 'Enter offset and angle to see the diagram' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Offset Without Elbows ───
function OffsetWithoutElbows({ t }: { t: (k: string, o?: Record<string, string>) => string }) {
  const [offset, setOffset] = useState('100');
  const [angle, setAngle] = useState('45');
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');

  const offsetMm = parseFloat(offset) || 0;
  const angleDeg = parseFloat(angle) || 45;
  const valid = offsetMm > 0 && angleDeg > 0 && angleDeg < 90;

  const result = useMemo(() => {
    if (!valid) return null;
    return calculateOffsetWithoutElbows(offsetMm, angleDeg);
  }, [offsetMm, angleDeg, valid]);

  const toUnit = (v: number) => unit === 'in' ? v / 25.4 : v;
  const fmtU = (v: number) => fmt(toUnit(v), unit === 'in' ? 2 : 1);

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        {(['mm', 'in'] as const).map((u) => (
          <button key={u} onClick={() => setUnit(u)}
            className={`rounded-sm border px-3 py-1 text-xs transition ${unit === u ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]' : 'border-zinc-800 text-zinc-400'}`}>
            {u}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.offset', { defaultValue: 'Offset' })} ({unit})
              </Label>
              <Input type="number" min="1" value={offset} onChange={(e) => setOffset(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.angle', { defaultValue: 'Angle' })} (°)
              </Label>
              <Select value={angle} onValueChange={setAngle}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANGLES.map((a) => <SelectItem key={a} value={String(a)}>{a}°</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {valid && result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ResultCard label="Travel" value={fmtU(result.travel)} unit={unit} />
              <ResultCard label="Run" value={fmtU(result.run)} unit={unit} accent="#a78bfa" />
              <ResultCard label={t('prefab.miterAngle', { defaultValue: 'Miter Angle' })} value={fmt(result.miterAngle, 1)} unit="°" accent="#22d3ee" />
            </div>
          )}
        </div>

        <div className="border border-zinc-800 bg-[#0d0d0d] p-4 rounded-sm">
          {valid && result ? (
            <svg viewBox="0 0 400 320" className="w-full" role="img" aria-label="Offset without elbows">
              {(() => {
                const maxD = Math.max(result.run, result.offset, 1);
                const sc = 200 / maxD;
                const x0 = 60, y0 = 280;
                const runPx = result.run * sc;
                const offPx = result.offset * sc;
                return (
                  <>
                    <line x1={x0} y1={y0} x2={x0 + 50} y2={y0} stroke="#71717a" strokeWidth="3" />
                    <line x1={x0 + 50} y1={y0} x2={x0 + 50 + runPx} y2={y0 - offPx} stroke="#f59e0b" strokeWidth="3" />
                    <line x1={x0 + 50 + runPx} y1={y0 - offPx} x2={x0 + 50 + runPx + 50} y2={y0 - offPx} stroke="#71717a" strokeWidth="3" />
                    {/* Miter marks */}
                    <line x1={x0 + 50 - 8} y1={y0 - 8} x2={x0 + 50 + 8} y2={y0 + 8} stroke="#ef4444" strokeWidth="2" strokeDasharray="3 2" />
                    <line x1={x0 + 50 + runPx - 8} y1={y0 - offPx - 8} x2={x0 + 50 + runPx + 8} y2={y0 - offPx + 8} stroke="#ef4444" strokeWidth="2" strokeDasharray="3 2" />
                    <text x={(x0 + 50 + x0 + 50 + runPx) / 2 + 15} y={(y0 + y0 - offPx) / 2} fill="#f59e0b" fontSize="11" fontWeight="bold" textAnchor="middle">
                      {fmtU(result.travel)} {unit}
                    </text>
                    <text x={200} y={25} fill="#22d3ee" fontSize="11" textAnchor="middle" fontWeight="bold">
                      Miter: {fmt(result.miterAngle, 1)}°
                    </text>
                  </>
                );
              })()}
            </svg>
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-zinc-600">
              {t('prefab.enterValues', { defaultValue: 'Enter offset and angle' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Verify Offset ───
function VerifyOffset({ t }: { t: (k: string, o?: Record<string, string>) => string }) {
  const [measuredOffset, setMeasuredOffset] = useState('150');
  const [measuredTravel, setMeasuredTravel] = useState('212');
  const [angle, setAngle] = useState('45');
  const [tolerance, setTolerance] = useState('3');

  const result = useMemo(() => {
    const o = parseFloat(measuredOffset) || 0;
    const tr = parseFloat(measuredTravel) || 0;
    const a = parseFloat(angle) || 45;
    const tol = parseFloat(tolerance) || 3;
    if (o <= 0 || tr <= 0) return null;
    return verifyOffset(o, tr, a, tol);
  }, [measuredOffset, measuredTravel, angle, tolerance]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.measuredOffset', { defaultValue: 'Measured Offset' })} (mm)
              </Label>
              <Input type="number" value={measuredOffset} onChange={(e) => setMeasuredOffset(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.measuredTravel', { defaultValue: 'Measured Travel' })} (mm)
              </Label>
              <Input type="number" value={measuredTravel} onChange={(e) => setMeasuredTravel(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.angle', { defaultValue: 'Angle' })} (°)
              </Label>
              <Select value={angle} onValueChange={setAngle}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANGLES.map((a) => <SelectItem key={a} value={String(a)}>{a}°</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('prefab.tolerance', { defaultValue: 'Tolerance' })} (mm)
              </Label>
              <Input type="number" value={tolerance} onChange={(e) => setTolerance(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
            </div>
          </div>

          {result && (
            <div className={`rounded-md border-2 p-5 ${result.isCorrect ? 'border-green-600 bg-green-600/5' : 'border-red-600 bg-red-600/5'}`}>
              <p className={`text-lg font-bold ${result.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {result.isCorrect
                  ? t('prefab.verifyOk', { defaultValue: 'CORRECT — Within tolerance' })
                  : t('prefab.verifyFail', { defaultValue: 'OUT OF TOLERANCE' })}
              </p>
              <div className="mt-3 space-y-1 text-sm text-zinc-300">
                <p>{t('prefab.expectedOffset', { defaultValue: 'Expected offset' })}: <span className="font-mono font-bold">{fmt(result.expectedOffset)} mm</span></p>
                <p>{t('prefab.deviation', { defaultValue: 'Deviation' })}: <span className="font-mono font-bold">{fmt(result.deviation)} mm</span></p>
                <p>{t('prefab.tolerance', { defaultValue: 'Tolerance' })}: ±{fmt(result.tolerance)} mm</p>
              </div>
            </div>
          )}
        </div>

        <div className="border border-zinc-800 bg-[#0d0d0d] p-5 rounded-sm space-y-4">
          <h4 className="text-sm font-semibold text-zinc-200">{t('prefab.howToVerify', { defaultValue: 'How to verify an offset' })}</h4>
          <ol className="space-y-2 text-xs text-zinc-400 list-decimal list-inside">
            <li>{t('prefab.step1', { defaultValue: 'Measure the perpendicular distance between pipe centerlines (Offset).' })}</li>
            <li>{t('prefab.step2', { defaultValue: 'Measure the length along the inclined pipe (Travel).' })}</li>
            <li>{t('prefab.step3', { defaultValue: 'Enter the nominal angle of the offset.' })}</li>
            <li>{t('prefab.step4', { defaultValue: 'The tool checks: Offset = Travel × sin(Angle).' })}</li>
          </ol>
          <div className="mt-3 border-l-2 border-[#f59e0b] pl-3 font-mono text-xs text-zinc-300">
            <p className="text-[#f59e0b]">{t('prefab.formula', { defaultValue: 'Formula' })}</p>
            <p>Expected Offset = Travel × sin(θ)</p>
            <p>Deviation = |Measured − Expected|</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Suite Component ───
export default function PrefabSuite({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('prefab.title', { defaultValue: 'Prefabrication Suite' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('prefab.subtitle', { defaultValue: 'Offsets, pipe runs & verification for shop fabrication' })}
        </h3>
      </div>

      <Tabs defaultValue="offset-elbows">
        <TabsList className="bg-zinc-950 border border-zinc-800">
          <TabsTrigger value="offset-elbows">
            {t('prefab.tabOffsetElbows', { defaultValue: 'Offsets w/ Elbows' })}
          </TabsTrigger>
          <TabsTrigger value="offset-no-elbows">
            {t('prefab.tabOffsetNoElbows', { defaultValue: 'Offsets w/o Elbows' })}
          </TabsTrigger>
          <TabsTrigger value="verify">
            {t('prefab.tabVerify', { defaultValue: 'Verify' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offset-elbows" className="mt-6">
          <OffsetWithElbows t={t} />
        </TabsContent>

        <TabsContent value="offset-no-elbows" className="mt-6">
          <OffsetWithoutElbows t={t} />
        </TabsContent>

        <TabsContent value="verify" className="mt-6">
          <VerifyOffset t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

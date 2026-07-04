import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// FEAT-002: Branch Pipe Layout Calculator.
// Calculates the flat pattern (template) for a cylinder-cylinder intersection
// (branch pipe meeting header pipe at an angle).
// Formula: for each point i around the branch perimeter (0-360°):
//   h(i) = x/tan(angle) + sqrt((Dh/2)² - y²) - sqrt((Dh/2)² - (Db/2·sin)²)
// where x = (Db/2)·cos(i), y = (Db/2)·sin(i)

interface NpsEntry { nps: string; od: number; }

const NPS_OD: NpsEntry[] = [
  { nps: '1/2"', od: 21.3 }, { nps: '3/4"', od: 26.7 }, { nps: '1"', od: 33.4 },
  { nps: '1-1/4"', od: 42.2 }, { nps: '1-1/2"', od: 48.3 }, { nps: '2"', od: 60.3 },
  { nps: '2-1/2"', od: 73.0 }, { nps: '3"', od: 88.9 }, { nps: '4"', od: 114.3 },
  { nps: '6"', od: 168.3 }, { nps: '8"', od: 219.1 }, { nps: '10"', od: 273.0 },
  { nps: '12"', od: 323.8 }, { nps: '16"', od: 406.4 }, { nps: '20"', od: 508.0 },
  { nps: '24"', od: 609.6 },
];

interface Point { angle: number; h: number; }

function calculatePoints(
  Dh: number, Db: number, angleDeg: number, divisions: number
): Point[] {
  const angle = (angleDeg * Math.PI) / 180;
  const Rh = Dh / 2;
  const Rb = Db / 2;
  const points: Point[] = [];

  for (let i = 0; i < divisions; i++) {
    const theta = (i * 2 * Math.PI) / divisions;
    const x = Rb * Math.cos(theta);
    const y = Rb * Math.sin(theta);
    const term1 = x / Math.tan(angle);
    const term2 = Math.sqrt(Math.max(0, Rh * Rh - y * y));
    const term3 = Math.sqrt(Math.max(0, Rh * Rh - Rb * Rb * Math.sin(theta) * Math.sin(theta)));
    const h = term1 + term2 - term3;
    points.push({ angle: (i * 360) / divisions, h: Math.max(0, h) });
  }
  return points;
}

export default function BranchLayout({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [headerNps, setHeaderNps] = useState('6');
  const [branchNps, setBranchNps] = useState('3');
  const [angle, setAngle] = useState('90');
  const [divisions, setDivisions] = useState('24');

  const headerOd = NPS_OD.find((n) => n.nps === headerNps)?.od ?? 168.3;
  const branchOd = NPS_OD.find((n) => n.nps === branchNps)?.od ?? 88.9;
  const angleNum = parseFloat(angle) || 90;
  const divNum = parseInt(divisions) || 24;

  const valid = headerOd > branchOd && angleNum > 0 && angleNum <= 90 && divNum >= 12;

  const points = useMemo(() => {
    if (!valid) return [];
    return calculatePoints(headerOd, branchOd, angleNum, divNum);
  }, [headerOd, branchOd, angleNum, divNum, valid]);

  const maxH = Math.max(1, ...points.map((p) => p.h));
  const branchPerimeter = branchOd * Math.PI;

  // SVG flat pattern: X = perimeter (scaled), Y = h (scaled)
  const svgWidth = 600;
  const svgHeight = 300;
  const padX = 40;
  const padY = 30;
  const plotW = svgWidth - 2 * padX;
  const plotH = svgHeight - 2 * padY;

  const pathData = useMemo(() => {
    if (points.length === 0) return '';
    const coords = points.map((p, i) => {
      const x = padX + (i / (points.length - 1)) * plotW;
      const y = padY + plotH - (p.h / maxH) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${coords.join(' L ')}`;
  }, [points, maxH]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.branchLayout', { defaultValue: 'Branch Pipe Layout' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.branchLayoutSubtitle', { defaultValue: 'Cylinder-cylinder intersection template' })}
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Header Pipe (NPS)</Label>
          <Select value={headerNps} onValueChange={setHeaderNps}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NPS_OD.map((n) => <SelectItem key={n.nps} value={n.nps}>{n.nps} (OD {n.od}mm)</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Branch Pipe (NPS)</Label>
          <Select value={branchNps} onValueChange={setBranchNps}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NPS_OD.map((n) => <SelectItem key={n.nps} value={n.nps}>{n.nps} (OD {n.od}mm)</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Intersection Angle (°)</Label>
          <Input value={angle} onChange={(e) => setAngle(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Divisions</Label>
          <Select value={divisions} onValueChange={setDivisions}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12</SelectItem>
              <SelectItem value="24">24</SelectItem>
              <SelectItem value="36">36</SelectItem>
              <SelectItem value="48">48</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!valid && headerOd <= branchOd && (
        <p className="text-sm text-red-400">Header pipe must be larger than branch pipe.</p>
      )}

      {valid && points.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">Max Cut Height</p>
              <p className="mt-1 text-xl font-bold text-zinc-100">{maxH.toFixed(2)} mm</p>
            </div>
            <div className="border-l-2 border-zinc-700 bg-zinc-900/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Branch Perimeter</p>
              <p className="mt-1 text-xl font-bold text-zinc-100">{branchPerimeter.toFixed(1)} mm</p>
            </div>
            <div className="border-l-2 border-zinc-700 bg-zinc-900/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Template Width</p>
              <p className="mt-1 text-xl font-bold text-zinc-100">{(branchPerimeter).toFixed(0)} mm</p>
              <p className="text-[10px] text-zinc-500">Wrap around branch pipe</p>
            </div>
          </div>

          {/* SVG flat pattern */}
          <div className="border border-zinc-800 bg-[#0d0d0d] p-4">
            <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {t('tools.flatPattern', { defaultValue: 'Flat Pattern Template' })}
            </p>
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full" role="img" aria-label="Branch pipe flat pattern template">
              {/* Grid */}
              <line x1={padX} y1={padY} x2={padX} y2={padY + plotH} stroke="#27272a" strokeWidth="1" />
              <line x1={padX} y1={padY + plotH} x2={padX + plotW} y2={padY + plotH} stroke="#27272a" strokeWidth="1" />
              {/* Pattern path */}
              <path d={pathData} fill="none" stroke="#f59e0b" strokeWidth="2" />
              {/* Close the shape */}
              <path
                d={`${pathData} L ${padX + plotW},${padY + plotH} L ${padX},${padY + plotH} Z`}
                fill="#f59e0b" fillOpacity="0.08" stroke="none"
              />
              {/* Labels */}
              <text x={svgWidth / 2} y={svgHeight - 5} fill="#52525b" fontSize="10" textAnchor="middle">
                Perimeter (mm) — {branchPerimeter.toFixed(0)}mm total
              </text>
              <text x={10} y={svgHeight / 2} fill="#52525b" fontSize="10" textAnchor="middle" transform={`rotate(-90 10 ${svgHeight / 2})`}>
                Cut height (mm) — max {maxH.toFixed(1)}mm
              </text>
            </svg>
          </div>

          {/* Cut table */}
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Point #</th>
                  <th className="px-3 py-2 text-right">Angle (°)</th>
                  <th className="px-3 py-2 text-right">Cut Height (mm)</th>
                  <th className="px-3 py-2 text-right">Distance from edge (mm)</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-800/60 hover:bg-zinc-900/30">
                    <td className="px-3 py-2 text-zinc-300">{i + 1}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{p.angle.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-100">{p.h.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{((i / (points.length - 1)) * branchPerimeter).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-zinc-600">
            Print at 1:1 scale, wrap around the branch pipe, and mark the cut line at each point.
          </p>
        </>
      )}
    </div>
  );
}

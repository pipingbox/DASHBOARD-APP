import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shapes } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import ToolBase from '@/components/tools/ToolBase';
import { solveMiteredElbow } from '@/tools/core/geometry/miters';
import { listNps, listSchedules, getPipeDimension, getElbowRadius } from '@/tools/core/standards';
import { toMm, fromMm } from '@/tools/core/units';

type UnitSystem = 'metric' | 'imperial';

interface MiterDiagramProps {
  segments: number;
  jointDeflectionDeg: number;
  pieceLength: number;
}

function MiterDiagram({ segments, jointDeflectionDeg, pieceLength }: MiterDiagramProps) {
  const svgW = 360;
  const svgH = 220;
  const startX = 40;
  const startY = 180;

  // Build polygonal chain: each segment length pieceLength, turning by jointDeflectionDeg
  const points: { x: number; y: number }[] = [{ x: startX, y: startY }];
  let currentAngle = 0;
  const scale = Math.min(240 / (segments * pieceLength), 120 / (segments * pieceLength * Math.sin((jointDeflectionDeg * Math.PI) / 180) || 1)) * 0.8 || 1;

  for (let i = 0; i < segments; i++) {
    const last = points[points.length - 1];
    const rad = (currentAngle * Math.PI) / 180;
    points.push({
      x: last.x + pieceLength * scale * Math.cos(rad),
      y: last.y - pieceLength * scale * Math.sin(rad),
    });
    currentAngle += jointDeflectionDeg;
  }

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md">
      <path d={pathD} fill="none" stroke="#FF8C00" strokeWidth={10} strokeLinecap="square" strokeLinejoin="miter" />
      <path d={pathD} fill="none" stroke="#151A22" strokeWidth={6} strokeLinecap="square" strokeLinejoin="miter" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#F5F7FA" />
      ))}
      <text x={startX} y={startY + 20} fill="#A3A9B3" fontSize="10">Start</text>
      <text x={points[points.length - 1].x - 20} y={points[points.length - 1].y - 10} fill="#A3A9B3" fontSize="10">End</text>
      <text x={svgW / 2} y={30} textAnchor="middle" fill="#F5F7FA" fontSize="11">
        {segments} pieces · {jointDeflectionDeg.toFixed(1)}°/joint · cut {pieceLength.toFixed(1)} mm
      </text>
    </svg>
  );
}

export default function MiteredElbowTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [nps, setNps] = useState('6');
  const [schedule, setSchedule] = useState('STD');
  const [totalAngleDeg, setTotalAngleDeg] = useState('90');
  const [segments, setSegments] = useState('3');
  const [elbowType, setElbowType] = useState<'LR' | 'SR'>('LR');
  const [clrOverride, setClrOverride] = useState('');

  const schedules = useMemo(() => listSchedules(nps), [nps]);
  const dim = useMemo(() => {
    const res = getPipeDimension({ nps, schedule });
    return res.success ? res.dimension : null;
  }, [nps, schedule]);

  const clrMm = useMemo(() => {
    if (clrOverride.trim()) {
      const v = Number(clrOverride);
      return Number.isFinite(v) && v > 0 ? toMm(v, unitSystem === 'metric' ? 'mm' : 'in') : undefined;
    }
    return getElbowRadius(nps, elbowType);
  }, [clrOverride, nps, elbowType, unitSystem]);

  const { result, error } = useMemo(() => {
    if (!dim || clrMm === undefined) return { result: null, error: null };
    const total = Number(totalAngleDeg);
    const n = Number(segments);
    const res = solveMiteredElbow({ totalAngleDeg: total, segments: n, radiusMm: clrMm, odMm: dim.odMm });
    if (res.success === false) {
      return { result: null, error: res.reason };
    }
    return { result: res.result, error: null };
  }, [dim, clrMm, totalAngleDeg, segments]);

  const fmt = (v: number) => (unitSystem === 'metric' ? `${v.toFixed(1)} mm` : `${fromMm(v, 'in').toFixed(3)} in`);

  return (
    <ToolBase
      title={t('tools.prefab.miteredElbow.title')}
      standard="B16.9 CROSS_REFERENCE"
      icon={<Shapes className="h-5 w-5" />}
      inputs={
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={unitSystem === 'metric' ? 'default' : 'outline'}
              onClick={() => setUnitSystem('metric')}
              className={unitSystem === 'metric' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
            >
              mm
            </Button>
            <Button
              type="button"
              size="sm"
              variant={unitSystem === 'imperial' ? 'default' : 'outline'}
              onClick={() => setUnitSystem('imperial')}
              className={unitSystem === 'imperial' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
            >
              in
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.miteredElbow.nps')}</Label>
              <Select value={nps} onValueChange={setNps}>
                <SelectTrigger className="bg-[#0E1117] border-[#232A36]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0E1117] border-[#232A36]">
                  {listNps().map((n) => (
                    <SelectItem key={n} value={n}>{npsLabel(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.miteredElbow.schedule')}</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger className="bg-[#0E1117] border-[#232A36]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0E1117] border-[#232A36]">
                  {schedules.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.miteredElbow.totalAngle')}</Label>
              <Input value={totalAngleDeg} onChange={(e) => setTotalAngleDeg(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.miteredElbow.segments')}</Label>
              <Input value={segments} onChange={(e) => setSegments(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.miteredElbow.elbowType')}</Label>
              <Select value={elbowType} onValueChange={(v) => setElbowType(v as 'LR' | 'SR')}>
                <SelectTrigger className="bg-[#0E1117] border-[#232A36]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0E1117] border-[#232A36]">
                  <SelectItem value="LR">LR</SelectItem>
                  <SelectItem value="SR">SR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <LengthField label={t('tools.prefab.miteredElbow.clrOverride')} value={clrOverride} onChange={setClrOverride} />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {dim && (
            <p className="text-[11px] text-[#A3A9B3]">
              OD = {fmt(dim.odMm)} · CLR = {clrMm !== undefined ? fmt(clrMm) : t('tools.prefab.common.na')}
            </p>
          )}
        </div>
      }
      svg={
        result ? (
          <MiterDiagram
            segments={result.segments}
            jointDeflectionDeg={result.jointDeflectionDeg}
            pieceLength={result.segmentsGeometry[0]?.centerLineLengthMm ?? 0}
          />
        ) : (
          <svg viewBox="0 0 360 220" className="w-full max-w-md">
            <text x="180" y="110" textAnchor="middle" fill="#A3A9B3" fontSize="12">Enter parameters to draw the miter elbow</text>
          </svg>
        )
      }
      results={
        result ? (
          <div className="space-y-3">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-[#232A36]">
                <tr><th className="py-2 text-[#A3A9B3] font-normal">N (pieces)</th><td className="py-2 text-[#F5F7FA]">{result.segments}</td></tr>
                <tr><th className="py-2 text-[#A3A9B3] font-normal">J (joints)</th><td className="py-2 text-[#F5F7FA]">{result.numberOfJoints}</td></tr>
                <tr><th className="py-2 text-[#A3A9B3] font-normal">Joint deflection</th><td className="py-2 text-[#F5F7FA]">{result.jointDeflectionDeg.toFixed(2)}°</td></tr>
                <tr><th className="py-2 text-[#A3A9B3] font-normal">Cut angle / end</th><td className="py-2 text-[#F5F7FA]">{result.cutAngleDeg.toFixed(2)}°</td></tr>
                <tr><th className="py-2 text-[#A3A9B3] font-normal">Total centerline</th><td className="py-2 text-[#F5F7FA]">{fmt(result.totalCenterLineLengthMm)}</td></tr>
              </tbody>
            </table>

            <p className="text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">Per piece</p>
            <table className="w-full text-left text-sm">
              <thead className="text-[#A3A9B3]">
                <tr>
                  <th className="py-1">#</th>
                  <th className="py-1">Centerline</th>
                  <th className="py-1">Intrados</th>
                  <th className="py-1">Extrados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232A36]">
                {result.segmentsGeometry.map((seg) => (
                  <tr key={seg.segmentIndex}>
                    <td className="py-1 text-[#F5F7FA]">{seg.segmentIndex}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(seg.centerLineLengthMm)}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(seg.intradosLengthMm)}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(seg.extradosLengthMm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
        )
      }
      notes={
        <div className="space-y-2 text-xs text-[#A3A9B3]">
          <p>{t('tools.prefab.miteredElbow.noteGeometry')}</p>
          <p>{t('tools.prefab.miteredElbow.noteProvenance')}</p>
        </div>
      }
    />
  );
}

function LengthField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
    </div>
  );
}

function npsLabel(nps: string): string {
  return `${nps}"`;
}

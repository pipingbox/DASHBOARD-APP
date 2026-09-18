import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shapes } from 'lucide-react';
import ToolBase from '@/components/tools/ToolBase';
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
import { solveMiteredElbow, type MiteredElbowSolution } from '@/tools/core/geometry/miters';
import { listSchedules, getPipeDimension, getElbowRadius, ELBOW_RADIUS_PROVENANCE } from '@/tools/core/standards';
import { toMm, fromMm } from '@/tools/core/units';
import { mapEngineError, useUnitFieldConversion, type UnitSystem } from '../shared';

interface MiterDiagramProps {
  solution: MiteredElbowSolution | null;
  placeholder: string;
}

/**
 * Original PipingBox mitered-elbow diagram (mm space).
 * Draws the polygonal centerline using the engine's per-piece tangent
 * lengths (end pieces = T, middle pieces = 2T), so the drawing and the
 * fabrication lengths share one geometry.
 */
function MiterDiagram({ solution, placeholder }: MiterDiagramProps) {
  if (!solution) {
    return (
      <svg viewBox="0 0 400 260" className="w-full max-w-md">
        <text x="200" y="130" textAnchor="middle" fill="#A3A9B3" fontSize="12">
          {placeholder}
        </text>
      </svg>
    );
  }

  const { segmentsGeometry, jointDeflectionDeg, cutAngleDeg } = solution;

  // Build the polygonal chain in mm.
  let x = 0;
  let y = 0;
  let heading = 0;
  const points = [{ x, y }];
  for (const seg of segmentsGeometry) {
    x += seg.centerLineLengthMm * Math.cos((heading * Math.PI) / 180);
    y += seg.centerLineLengthMm * Math.sin((heading * Math.PI) / 180);
    points.push({ x, y });
    heading += jointDeflectionDeg;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 40;
  const svgW = 400;
  const svgH = 260;
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((svgW - 2 * pad) / spanX, (svgH - 2 * pad) / spanY);
  const X = (v: number) => pad + (v - minX) * scale;
  const Y = (v: number) => svgH - pad - (v - minY) * scale;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p.x).toFixed(2)} ${Y(p.y).toFixed(2)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md">
      <path d={path} fill="none" stroke="#FF8C00" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={3} fill={i === 0 || i === points.length - 1 ? '#F5F7FA' : '#FF8C00'} />
      ))}
      <text x={X(points[0].x)} y={Y(points[0].y) + 18} textAnchor="middle" fill="#A3A9B3" fontSize="10">
        P1
      </text>
      <text
        x={X(points[points.length - 1].x)}
        y={Y(points[points.length - 1].y) - 12}
        textAnchor="middle"
        fill="#A3A9B3"
        fontSize="10"
      >
        P{points.length}
      </text>
      <text x={svgW / 2} y={20} textAnchor="middle" fill="#A3A9B3" fontSize="10">
        {solution.segments} gores · δ = {jointDeflectionDeg}°/joint · φ = {cutAngleDeg}°
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

  useUnitFieldConversion(unitSystem, [[clrOverride, setClrOverride]]);

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
      return { result: null, error: mapEngineError(t, res) };
    }
    return { result: res.result, error: null };
  }, [dim, clrMm, totalAngleDeg, segments, t]);

  const fmt = (v: number) => (unitSystem === 'metric' ? `${v.toFixed(1)} mm` : `${fromMm(v, 'in').toFixed(3)} in`);
  const fmtDeg = (v: number) => `${v.toFixed(2)}°`;

  return (
    <ToolBase
      title={t('tools.prefab.miteredElbow.title')}
      standard={`B16.9 ${ELBOW_RADIUS_PROVENANCE.sourceStatus}`}
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
                  {npsList().map((n) => (
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
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.miteredElbow.clrOverride')}</Label>
              <Input value={clrOverride} onChange={(e) => setClrOverride(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {dim && (
            <p className="text-[11px] text-[#A3A9B3]">
              OD = {fmt(dim.odMm)} · CLR = {clrMm !== undefined ? fmt(clrMm) : t('tools.prefab.common.na')}
            </p>
          )}
        </div>
      }
      svg={<MiterDiagram solution={result} placeholder={t('tools.prefab.miteredElbow.drawPlaceholder')} />}
      results={
        result ? (
          <div className="space-y-4">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-[#232A36]">
                <tr>
                  <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.miteredElbow.nPieces')}</th>
                  <td className="py-2 text-[#F5F7FA]">{result.segments}</td>
                </tr>
                <tr>
                  <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.miteredElbow.jJoints')}</th>
                  <td className="py-2 text-[#F5F7FA]">{result.numberOfJoints}</td>
                </tr>
                <tr>
                  <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.miteredElbow.jointDeflection')}</th>
                  <td className="py-2 text-[#F5F7FA]">{fmtDeg(result.jointDeflectionDeg)}</td>
                </tr>
                <tr>
                  <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.miteredElbow.cutAngleEnd')}</th>
                  <td className="py-2 text-[#F5F7FA]">{fmtDeg(result.cutAngleDeg)}</td>
                </tr>
                <tr>
                  <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.miteredElbow.tangentLength')}</th>
                  <td className="py-2 text-[#F5F7FA]">{fmt(result.tangentLengthMm)}</td>
                </tr>
                <tr>
                  <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.miteredElbow.totalCenterline')}</th>
                  <td className="py-2 text-[#F5F7FA]">{fmt(result.totalCenterLineLengthMm)}</td>
                </tr>
              </tbody>
            </table>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#A3A9B3]">
                    <th className="py-2">{t('tools.prefab.miteredElbow.piece')}</th>
                    <th className="py-2">{t('tools.prefab.miteredElbow.kind')}</th>
                    <th className="py-2">{t('tools.prefab.miteredElbow.centerline')}</th>
                    <th className="py-2">{t('tools.prefab.miteredElbow.intrados')}</th>
                    <th className="py-2">{t('tools.prefab.miteredElbow.extrados')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232A36]">
                  {result.segmentsGeometry.map((seg) => (
                    <tr key={seg.segmentIndex}>
                      <td className="py-2 text-[#F5F7FA]">{seg.segmentIndex}</td>
                      <td className="py-2 text-[#F5F7FA]">
                        {seg.kind === 'end' ? t('tools.prefab.miteredElbow.endPiece') : t('tools.prefab.miteredElbow.middlePiece')}
                      </td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(seg.centerLineLengthMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(seg.intradosLengthMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(seg.extradosLengthMm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
        )
      }
      notes={t('tools.prefab.miteredElbow.notes')}
    />
  );
}

function npsList(): string[] {
  return NPS_LIST;
}

const NPS_LIST = ['1/2', '3/4', '1', '1-1/4', '1-1/2', '2', '2-1/2', '3', '4', '6', '8', '10', '12'];

function npsLabel(nps: string): string {
  return `${nps}"`;
}

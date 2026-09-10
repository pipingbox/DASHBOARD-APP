import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignHorizontalDistributeCenter } from 'lucide-react';
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
import { solvePipeComb, type PipeCombSolution } from '@/tools/core/geometry/pipe-comb';
import { listNps, listSchedules, getPipeDimension, getElbowRadius } from '@/tools/core/standards';
import { toMm, fromMm } from '@/tools/core/units';
import { mapEngineError, useUnitFieldConversion, type UnitSystem } from '../shared';

interface PipeCombDiagramProps {
  /** Solved engine result (all lengths in mm). */
  result: PipeCombSolution;
  /** Label formatters supplied by the tool (already localized + unit-aware). */
  fmt: (v: number | undefined) => string;
  labels: {
    startSpacing: string;
    endSpacing: string;
    angle: string;
    placeholder: string;
  };
}

/**
 * Original PipingBox pipe-comb diagram.
 *
 * All geometry is computed in mm from the engine result; the formatter is
 * only used for text labels, so toggling mm/in changes labels but never the
 * physical geometry. Line i starts at y = i · initialSpacing and ends at
 * y = i · finalSpacing (equivalent to the engine's per-line offset), so the
 * drawing reference and the offset reference are the same.
 */
function PipeCombDiagram({ result, fmt, labels }: PipeCombDiagramProps) {
  const { lines, initialSpacingMm, finalSpacingMm, elbowAngleDeg, deltaSpacingMm } = result;
  const lineCount = lines.length;
  if (lineCount === 0) {
    return (
      <svg viewBox="0 0 400 260" className="w-full max-w-xl">
        <text x="200" y="130" textAnchor="middle" fill="#A3A9B3" fontSize="12">
          {labels.placeholder}
        </text>
      </svg>
    );
  }

  const maxAdvance = Math.max(...lines.map((l) => l.advanceMm), 0);
  const yStart = (i: number) => i * initialSpacingMm;
  const yEnd = (i: number) => i * finalSpacingMm;
  const xMax = Math.max(2 * maxAdvance, 1);
  const yMax = Math.max(yStart(lineCount - 1), yEnd(lineCount - 1), 1);

  // Station coordinates in mm space.
  const station1 = (i: number) => lines[i].advanceMm; // first bend
  const station2 = (i: number) => 2 * lines[i].advanceMm; // second bend

  // Fit into viewBox.
  const padX = 56;
  const padY = 34;
  const svgW = 460;
  const svgH = 300;
  const scale = Math.min((svgW - 2 * padX) / xMax, (svgH - 2 * padY) / yMax);
  const X = (mm: number) => padX + mm * scale;
  const Y = (mm: number) => padY + mm * scale;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-xl">
      {lines.map((line, i) => {
        const y0 = yStart(i);
        const y1 = yEnd(i);
        const s1 = station1(i);
        const s2 = station2(i);
        const color = deltaSpacingMm === 0 ? '#3A4454' : '#FF8C00';
        return (
          <g key={line.id}>
            {line.offsetAbsMm === 0 ? (
              <line x1={X(0)} y1={Y(y0)} x2={X(xMax)} y2={Y(y1)} stroke={color} strokeWidth={2.5} />
            ) : (
              <>
                <line x1={X(0)} y1={Y(y0)} x2={X(s1)} y2={Y(y0)} stroke={color} strokeWidth={2.5} />
                <line x1={X(s1)} y1={Y(y0)} x2={X(s2)} y2={Y(y1)} stroke={color} strokeWidth={2.5} />
                <line x1={X(s2)} y1={Y(y1)} x2={X(xMax)} y2={Y(y1)} stroke={color} strokeWidth={2.5} />
                {/* bend stations */}
                <circle cx={X(s1)} cy={Y(y0)} r={2.5} fill="#F5F7FA" />
                <circle cx={X(s2)} cy={Y(y1)} r={2.5} fill="#F5F7FA" />
              </>
            )}
            <text x={padX - 8} y={Y(y0) + 3} textAnchor="end" fill="#A3A9B3" fontSize="10">
              L{line.id}
            </text>
          </g>
        );
      })}

      {/* spacing annotations — same reference as the engine offsets */}
      <text x={X(xMax) + 8} y={Y(0) + 4} fill="#A3A9B3" fontSize="9">
        {labels.startSpacing} {fmt(initialSpacingMm)}
      </text>
      <text x={X(xMax) + 8} y={Y(finalSpacingMm) + 4} fill="#A3A9B3" fontSize="9">
        {labels.endSpacing} {fmt(finalSpacingMm)}
      </text>

      {/* common elbow angle */}
      {deltaSpacingMm !== 0 && (
        <text x={X(xMax / 2)} y={Y(yMax) + 22} textAnchor="middle" fill="#A3A9B3" fontSize="10">
          {labels.angle} {elbowAngleDeg}°
        </text>
      )}
    </svg>
  );
}

export default function PipeCombTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [lineCount, setLineCount] = useState('4');
  const [initialSpacing, setInitialSpacing] = useState('200');
  const [finalSpacing, setFinalSpacing] = useState('400');
  const [elbowAngle, setElbowAngle] = useState('45');
  const [nps, setNps] = useState('6');
  const [schedule, setSchedule] = useState('STD');
  const [elbowType, setElbowType] = useState<'LR' | 'SR'>('LR');
  const [clrOverride, setClrOverride] = useState('');

  // Unit toggle converts values, preserving physical dimensions.
  useUnitFieldConversion(unitSystem, [
    [initialSpacing, setInitialSpacing],
    [finalSpacing, setFinalSpacing],
    [clrOverride, setClrOverride],
  ]);

  const schedules = useMemo(() => listSchedules(nps), [nps]);

  const parseLength = (v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return toMm(n, unitSystem === 'metric' ? 'mm' : 'in');
  };

  const clrMm = useMemo(() => {
    if (clrOverride.trim()) {
      const v = Number(clrOverride);
      return Number.isFinite(v) && v > 0 ? toMm(v, unitSystem === 'metric' ? 'mm' : 'in') : undefined;
    }
    return getElbowRadius(nps, elbowType);
  }, [clrOverride, nps, elbowType, unitSystem]);

  const { result, error } = useMemo(() => {
    const count = Number(lineCount);
    const initial = parseLength(initialSpacing);
    const final = parseLength(finalSpacing);
    const angle = Number(elbowAngle);
    if (initial === undefined || final === undefined) {
      return { result: null, error: null };
    }
    if (clrMm === undefined) {
      return { result: null, error: t('tools.prefab.offset.errorClr') };
    }
    const res = solvePipeComb({
      lineCount: count,
      initialSpacingMm: initial,
      finalSpacingMm: final,
      elbowAngleDeg: angle,
      clrMm,
    });
    if (res.success === false) {
      return { result: null, error: mapEngineError(t, res) };
    }
    return { result: res.result, error: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineCount, initialSpacing, finalSpacing, elbowAngle, clrMm, unitSystem, t]);

  const fmt = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    return unitSystem === 'metric' ? `${v.toFixed(1)} mm` : `${fromMm(v, 'in').toFixed(3)} in`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-[#232A36] pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF8C00]/10 text-[#FF8C00]">
          <AlignHorizontalDistributeCenter className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#F5F7FA]">{t('tools.prefab.pipeComb.title')}</h3>
          <p className="text-xs text-[#A3A9B3]">{t('tools.prefab.common.engineBadge')}</p>
        </div>
      </div>

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
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.lineCount')}</Label>
          <Input value={lineCount} onChange={(e) => setLineCount(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.initialSpacing')}</Label>
          <Input value={initialSpacing} onChange={(e) => setInitialSpacing(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.finalSpacing')}</Label>
          <Input value={finalSpacing} onChange={(e) => setFinalSpacing(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.elbowAngle')}</Label>
          <Input value={elbowAngle} onChange={(e) => setElbowAngle(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.nps')}</Label>
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
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.schedule')}</Label>
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
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.elbowType')}</Label>
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
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.pipeComb.clrOverride')}</Label>
          <Input value={clrOverride} onChange={(e) => setClrOverride(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <p className="text-[11px] text-[#A3A9B3]">
        CLR = {clrMm !== undefined ? fmt(clrMm) : t('tools.prefab.common.na')}
      </p>

      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        <h4 className="mb-3 text-[11px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.common.drawing')}</h4>
        {result ? (
          <PipeCombDiagram
            result={result}
            fmt={fmt}
            labels={{
              startSpacing: t('tools.prefab.pipeComb.startSpacing'),
              endSpacing: t('tools.prefab.pipeComb.endSpacing'),
              angle: t('tools.prefab.pipeComb.angleLabel'),
              placeholder: t('tools.prefab.pipeComb.drawPlaceholder'),
            }}
          />
        ) : (
          <svg viewBox="0 0 460 300" className="w-full max-w-xl">
            <text x="230" y="150" textAnchor="middle" fill="#A3A9B3" fontSize="12">
              {t('tools.prefab.pipeComb.drawPlaceholder')}
            </text>
          </svg>
        )}
      </div>

      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        <h4 className="mb-3 text-[11px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.common.results')}</h4>
        {result ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.angleLabel')}</p>
                <p className="text-lg font-semibold text-[#F5F7FA]">{result.elbowAngleDeg}°</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.travelSpread')}</p>
                <p className="text-lg font-semibold text-[#F5F7FA]">{fmt(result.travelSpreadMm)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#A3A9B3]">
                    <th className="py-2">{t('tools.prefab.pipeComb.line')}</th>
                    <th className="py-2">{t('tools.prefab.pipeComb.offset')}</th>
                    <th className="py-2">{t('tools.prefab.pipeComb.advance')}</th>
                    <th className="py-2">{t('tools.prefab.pipeComb.travel')}</th>
                    <th className="py-2">{t('tools.prefab.pipeComb.straightCut')}</th>
                    <th className="py-2">{t('tools.prefab.pipeComb.diff')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232A36]">
                  {result.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 text-[#F5F7FA]">{line.id}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(line.offsetMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(line.advanceMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(line.travelMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(line.straightCutLengthMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">{fmt(line.travelDifferenceMm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
        )}
      </div>
    </div>
  );
}

function npsLabel(nps: string): string {
  return `${nps}"`;
}

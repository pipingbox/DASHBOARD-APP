import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignJustify } from 'lucide-react';
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
import { solvePipeComb } from '@/tools/core/geometry/pipe-comb';
import { listNps, listSchedules, getPipeDimension, getElbowRadius } from '@/tools/core/standards';
import { toMm, fromMm } from '@/tools/core/units';

type UnitSystem = 'metric' | 'imperial';

interface PipeCombDiagramProps {
  lineCount: number;
  initialSpacing: number;
  finalSpacing: number;
  advance: number;
  lines: { id: string; offsetMm: number; travelMm: number }[];
}

function PipeCombDiagram({ lineCount, initialSpacing, finalSpacing, advance, lines }: PipeCombDiagramProps) {
  const svgW = 400;
  const svgH = 320;
  const padX = 50;
  const padY = 40;
  const graphW = svgW - 2 * padX;
  const graphH = svgH - 2 * padY;

  const offsets = lines.map((l) => l.offsetMm);
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  const offsetSpan = Math.max(maxOffset - minOffset, initialSpacing, finalSpacing);

  const xScale = graphW / Math.max(advance, 1);
  const yScale = offsetSpan > 0 ? (graphH * 0.7) / offsetSpan : 1;

  const startX = padX;
  const endX = padX + advance * xScale;
  const baseY = padY + graphH * 0.6 - minOffset * yScale;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md">
      {/* Reference start/end spacing lines */}
      <line x1={startX} y1={baseY} x2={startX} y2={baseY - (lineCount - 1) * initialSpacing * yScale} stroke="#3A4454" strokeWidth={1} />
      <line x1={endX} y1={baseY} x2={endX} y2={baseY - (lineCount - 1) * finalSpacing * yScale} stroke="#3A4454" strokeWidth={1} />

      {lines.map((line, i) => {
        const yStart = baseY - i * initialSpacing * yScale;
        const yEnd = baseY + line.offsetMm * yScale;
        return (
          <g key={line.id}>
            <line x1={startX} y1={yStart} x2={endX} y2={yEnd} stroke="#FF8C00" strokeWidth={3} />
            <text x={startX - 8} y={yStart + 3} textAnchor="end" fill="#A3A9B3" fontSize="9">L{line.id}</text>
            <circle cx={endX} cy={yEnd} r={3} fill="#F5F7FA" />
          </g>
        );
      })}

      <text x={startX} y={svgH - 12} fill="#A3A9B3" fontSize="10">Start spacing {initialSpacing.toFixed(0)} mm</text>
      <text x={endX} y={svgH - 12} textAnchor="end" fill="#A3A9B3" fontSize="10">End spacing {finalSpacing.toFixed(0)} mm</text>
      <text x={(startX + endX) / 2} y={20} textAnchor="middle" fill="#F5F7FA" fontSize="11">Advance = {advance.toFixed(1)} mm</text>
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
  const [clrOverride, setClrOverride] = useState('50');

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
      return { result: null, error: res.reason };
    }
    return { result: res.result, error: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineCount, initialSpacing, finalSpacing, elbowAngle, clrMm, unitSystem, t]);

  const fmt = (v: number) => (unitSystem === 'metric' ? `${v.toFixed(1)} mm` : `${fromMm(v, 'in').toFixed(3)} in`);

  return (
    <ToolBase
      title={t('tools.prefab.pipeComb.title')}
      standard="Pure geometry engine — CROSS_REFERENCE"
      icon={<AlignJustify className="h-5 w-5" />}
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
            <LengthField label={t('tools.prefab.pipeComb.lineCount')} value={lineCount} onChange={setLineCount} />
            <LengthField label={t('tools.prefab.pipeComb.initialSpacing')} value={initialSpacing} onChange={setInitialSpacing} />
            <LengthField label={t('tools.prefab.pipeComb.finalSpacing')} value={finalSpacing} onChange={setFinalSpacing} />
            <LengthField label={t('tools.prefab.pipeComb.elbowAngle')} value={elbowAngle} onChange={setElbowAngle} unit="°" />

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

            <LengthField label={t('tools.prefab.pipeComb.clrOverride')} value={clrOverride} onChange={setClrOverride} />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {clrMm !== undefined && (
            <p className="text-[11px] text-[#A3A9B3]">CLR = {fmt(clrMm)}</p>
          )}
        </div>
      }
      svg={
        result ? (
          <PipeCombDiagram
            lineCount={result.lineCount}
            initialSpacing={Number(initialSpacing)}
            finalSpacing={Number(finalSpacing)}
            advance={result.advanceMm}
            lines={result.lines}
          />
        ) : (
          <svg viewBox="0 0 400 320" className="w-full max-w-md">
            <text x="200" y="160" textAnchor="middle" fill="#A3A9B3" fontSize="12">Enter parameters to draw the pipe comb</text>
          </svg>
        )
      }
      results={
        result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded border border-[#232A36] bg-[#0E1117] p-2">
                <p className="text-[10px] text-[#A3A9B3]">Advance</p>
                <p className="text-[#F5F7FA]">{fmt(result.advanceMm)}</p>
              </div>
              <div className="rounded border border-[#232A36] bg-[#0E1117] p-2">
                <p className="text-[10px] text-[#A3A9B3]">Travel spread</p>
                <p className="text-[#F5F7FA]">{fmt(result.travelSpreadMm)}</p>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="text-[#A3A9B3]">
                <tr>
                  <th className="py-1">Line</th>
                  <th className="py-1">Offset</th>
                  <th className="py-1">Travel</th>
                  <th className="py-1">Straight cut</th>
                  <th className="py-1">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232A36]">
                {result.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-1 text-[#F5F7FA]">{line.id}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(line.offsetMm)}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(line.travelMm)}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(line.straightCutLengthMm)}</td>
                    <td className="py-1 text-[#F5F7FA]">{fmt(line.travelDifferenceMm)}</td>
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
          <p>{t('tools.prefab.pipeComb.noteGeometry')}</p>
        </div>
      }
    />
  );
}

function LengthField({ label, value, onChange, unit }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{label} {unit ? `(${unit})` : ''}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="bg-[#0E1117] border-[#232A36]" />
    </div>
  );
}

function npsLabel(nps: string): string {
  return `${nps}"`;
}

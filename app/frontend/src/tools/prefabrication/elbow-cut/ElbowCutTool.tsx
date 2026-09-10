import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scissors } from 'lucide-react';
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
import {
  listNps,
  listSchedules,
  getPipeDimension,
  getElbowRadius,
  PIPE_DIMENSIONS_PROVENANCE,
  ELBOW_RADIUS_PROVENANCE,
} from '@/tools/core/standards';
import { toMm, fromMm } from '@/tools/core/units';
import { mapEngineError, useUnitFieldConversion, type UnitSystem } from '../shared';
import { solveElbowCut } from './engine';
import { ElbowCutDiagram } from './ElbowCutDiagram';

export default function ElbowCutTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [nps, setNps] = useState('6');
  const [schedule, setSchedule] = useState('STD');
  const [elbowType, setElbowType] = useState<'LR' | 'SR'>('LR');
  const [totalAngleDeg, setTotalAngleDeg] = useState('90');
  const [betaDeg, setBetaDeg] = useState('45');
  const [clrOverride, setClrOverride] = useState('');

  useUnitFieldConversion(unitSystem, [[clrOverride, setClrOverride]]);

  const npsList = useMemo(() => listNps(), []);
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
    const beta = Number(betaDeg);
    const res = solveElbowCut({
      odMm: dim.odMm,
      clrMm,
      totalAngleDeg: total,
      betaDeg: beta,
    });
    if (res.success === false) {
      return { result: null, error: mapEngineError(t, res) };
    }
    return { result: res.result, error: null };
  }, [dim, clrMm, totalAngleDeg, betaDeg, t]);

  const fmt = (v: number) => (unitSystem === 'metric' ? `${v.toFixed(1)} mm` : `${fromMm(v, 'in').toFixed(3)} in`);

  return (
    <ToolBase
      title={t('tools.prefab.elbowCut.title')}
      standard={`${PIPE_DIMENSIONS_PROVENANCE.datasetId} + B16.9 ${ELBOW_RADIUS_PROVENANCE.sourceStatus}`}
      icon={<Scissors className="h-5 w-5" />}
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
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.elbowCut.nps')}</Label>
              <Select value={nps} onValueChange={setNps}>
                <SelectTrigger className="bg-[#0E1117] border-[#232A36]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0E1117] border-[#232A36]">
                  {npsList.map((n) => (
                    <SelectItem key={n} value={n}>{npsLabel(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.elbowCut.schedule')}</Label>
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
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.elbowCut.elbowType')}</Label>
              <Select value={elbowType} onValueChange={(v) => setElbowType(v as 'LR' | 'SR')}>
                <SelectTrigger className="bg-[#0E1117] border-[#232A36]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0E1117] border-[#232A36]">
                  <SelectItem value="LR">LR (1.5×NPS)</SelectItem>
                  <SelectItem value="SR">SR (1.0×NPS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.elbowCut.totalAngle')}</Label>
              <Input
                value={totalAngleDeg}
                onChange={(e) => setTotalAngleDeg(e.target.value)}
                className="bg-[#0E1117] border-[#232A36]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.elbowCut.betaAngle')}</Label>
              <Input
                value={betaDeg}
                onChange={(e) => setBetaDeg(e.target.value)}
                className="bg-[#0E1117] border-[#232A36]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.elbowCut.clrOverride')} ({unitSystem === 'metric' ? 'mm' : 'in'})</Label>
              <Input
                value={clrOverride}
                placeholder={clrMm !== undefined ? fmt(clrMm) : ''}
                onChange={(e) => setClrOverride(e.target.value)}
                className="bg-[#0E1117] border-[#232A36]"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {dim && (
            <p className="text-[11px] text-[#A3A9B3]">
              OD = {fmt(dim.odMm)} · CLR = {clrMm !== undefined ? fmt(clrMm) : t('tools.prefab.common.na')}
            </p>
          )}
        </div>
      }
      svg={<ElbowCutDiagram result={result} placeholder={t('tools.prefab.elbowCut.drawPlaceholder')} cutLabel={t('tools.prefab.elbowCut.cutLabel')} fmt={fmt} />}
      results={
        result ? (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-[#232A36]">
              <tr>
                <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.elbowCut.cutIntrados')}</th>
                <td className="py-2 text-[#F5F7FA]">{fmt(result.cutIntradosMm)}</td>
              </tr>
              <tr>
                <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.elbowCut.cutCenterline')}</th>
                <td className="py-2 text-[#F5F7FA]">{fmt(result.cutCenterlineMm)}</td>
              </tr>
              <tr>
                <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.elbowCut.cutExtrados')}</th>
                <td className="py-2 text-[#F5F7FA]">{fmt(result.cutExtradosMm)}</td>
              </tr>
              <tr>
                <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.elbowCut.keptArc')}</th>
                <td className="py-2 text-[#F5F7FA]">{fmt(result.keptArcLengthMm)}</td>
              </tr>
              <tr>
                <th className="py-2 text-[#A3A9B3] font-normal">{t('tools.prefab.elbowCut.discardedArc')}</th>
                <td className="py-2 text-[#F5F7FA]">{fmt(result.discardedArcLengthMm)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
        )
      }
      notes={
        <div className="space-y-2 text-xs text-[#A3A9B3]">
          <p>{t('tools.prefab.elbowCut.noteGeometry')}</p>
          <p>{t('tools.prefab.elbowCut.noteProvenance')}</p>
        </div>
      }
    />
  );
}

function npsLabel(nps: string): string {
  return nps.includes('/') ? `${nps}"` : `${nps}"`;
}

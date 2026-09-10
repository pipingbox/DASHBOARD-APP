import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoveDiagonal } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  solveOffsetWithElbows,
  solveOffsetWithoutElbows,
  solveOffsetVerificationPartial,
} from '@/tools/core/geometry/offsets';
import { listNps, listSchedules, getPipeDimension, getElbowRadius } from '@/tools/core/standards';
import { toMm } from '@/tools/core/units';
import { OffsetWithElbowsDiagram, OffsetWithoutElbowsDiagram, OffsetVerificationDiagram } from './OffsetDiagrams';

type UnitSystem = 'metric' | 'imperial';

export default function OffsetTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');

  const parseLength = (v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return toMm(n, unitSystem === 'metric' ? 'mm' : 'in');
  };

  const fmt = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    return unitSystem === 'metric' ? `${v.toFixed(1)} mm` : `${(v / 25.4).toFixed(3)} in`;
  };

  const fmtDeg = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    return `${v.toFixed(2)}°`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-[#232A36] pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF8C00]/10 text-[#FF8C00]">
          <MoveDiagonal className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#F5F7FA]">{t('tools.prefab.offset.title')}</h3>
          <p className="text-xs text-[#A3A9B3]">Pure geometry engine — CROSS_REFERENCE</p>
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

      <Tabs defaultValue="withElbows" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[#0E1117]">
          <TabsTrigger value="withElbows">{t('tools.prefab.offset.tabWithElbows')}</TabsTrigger>
          <TabsTrigger value="withoutElbows">{t('tools.prefab.offset.tabWithoutElbows')}</TabsTrigger>
          <TabsTrigger value="verify">{t('tools.prefab.offset.tabVerify')}</TabsTrigger>
        </TabsList>

        <TabsContent value="withElbows">
          <WithElbows unitSystem={unitSystem} parseLength={parseLength} fmt={fmt} fmtDeg={fmtDeg} />
        </TabsContent>
        <TabsContent value="withoutElbows">
          <WithoutElbows unitSystem={unitSystem} parseLength={parseLength} fmt={fmt} fmtDeg={fmtDeg} />
        </TabsContent>
        <TabsContent value="verify">
          <Verification unitSystem={unitSystem} parseLength={parseLength} fmt={fmt} fmtDeg={fmtDeg} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface SectionProps {
  unitSystem?: UnitSystem;
  parseLength: (v: string) => number | undefined;
  fmt: (v: number | undefined) => string;
  fmtDeg: (v: number | undefined) => string;
}

function WithElbows({ unitSystem, parseLength, fmt, fmtDeg }: SectionProps) {
  const { t } = useTranslation();
  const [a, setA] = useState('300');
  const [b, setB] = useState('300');
  const [nps, setNps] = useState('6');
  const [schedule, setSchedule] = useState('STD');
  const [elbowType, setElbowType] = useState<'LR' | 'SR'>('LR');
  const [elbowAngle, setElbowAngle] = useState('45');
  const [clrOverride, setClrOverride] = useState('50');

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
    const aMm = parseLength(a);
    const bMm = parseLength(b);
    const angle = Number(elbowAngle);
    if (aMm === undefined || bMm === undefined) return { result: null, error: null };
    if (!Number.isFinite(angle) || angle <= 0 || angle > 90) {
      return { result: null, error: t('tools.prefab.offset.errorAngle') };
    }
    if (clrMm === undefined) {
      return { result: null, error: t('tools.prefab.offset.errorClr') };
    }
    const res = solveOffsetWithElbows({ a: aMm, b: bMm, clrMm, elbowAngleDeg: angle });
    if (res.success === false) {
      return { result: null, error: res.reason };
    }
    return { result: res.result, error: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, elbowAngle, clrMm, unitSystem, t]);

  return (
    <div className="space-y-4 rounded-lg border border-[#232A36] bg-[#151A22] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <LengthField label={t('tools.prefab.offset.a')} value={a} onChange={setA} />
        <LengthField label={t('tools.prefab.offset.b')} value={b} onChange={setB} />
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.offset.nps')}</Label>
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
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.offset.schedule')}</Label>
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
          <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{t('tools.prefab.offset.elbowType')}</Label>
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
        <LengthField label={t('tools.prefab.offset.elbowAngle')} value={elbowAngle} onChange={setElbowAngle} unit="°" />
        <LengthField label={t('tools.prefab.offset.clrOverride')} value={clrOverride} onChange={setClrOverride} />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {dim && (
        <p className="text-[11px] text-[#A3A9B3]">
          OD = {fmt(dim.odMm)} · CLR = {clrMm !== undefined ? fmt(clrMm) : t('tools.prefab.common.na')}
        </p>
      )}

      {result && (
        <OffsetWithElbowsDiagram a={result.a} b={result.b} h={result.h} thetaDeg={result.thetaDeg} />
      )}

      {result ? (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-[#232A36]">
            <tr><th className="py-2 text-[#A3A9B3] font-normal">H (travel)</th><td className="py-2 text-[#F5F7FA]">{fmt(result.h)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">θ</th><td className="py-2 text-[#F5F7FA]">{fmtDeg(result.thetaDeg)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">Take-out/elbow</th><td className="py-2 text-[#F5F7FA]">{fmt(result.takeOutPerElbowMm)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">Straight cut</th><td className="py-2 text-[#F5F7FA]">{fmt(result.straightCutLengthMm)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">Center-to-center</th><td className="py-2 text-[#F5F7FA]">{fmt(result.centerToCenterMm)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
      )}
    </div>
  );
}

function WithoutElbows({ unitSystem, parseLength, fmt, fmtDeg }: SectionProps) {
  const { t } = useTranslation();
  const [a, setA] = useState('300');
  const [b, setB] = useState('300');

  const { result, error } = useMemo(() => {
    const aMm = parseLength(a);
    const bMm = parseLength(b);
    if (aMm === undefined || bMm === undefined) return { result: null, error: null };
    const res = solveOffsetWithoutElbows({ a: aMm, b: bMm });
    if (res.success === false) {
      return { result: null, error: res.reason };
    }
    return { result: res.result, error: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, unitSystem]);

  return (
    <div className="space-y-4 rounded-lg border border-[#232A36] bg-[#151A22] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <LengthField label={t('tools.prefab.offset.a')} value={a} onChange={setA} />
        <LengthField label={t('tools.prefab.offset.b')} value={b} onChange={setB} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <OffsetWithoutElbowsDiagram a={result.a} b={result.b} h={result.h} thetaDeg={result.thetaDeg} />
      )}
      {result ? (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-[#232A36]">
            <tr><th className="py-2 text-[#A3A9B3] font-normal">H (diagonal)</th><td className="py-2 text-[#F5F7FA]">{fmt(result.h)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">θ</th><td className="py-2 text-[#F5F7FA]">{fmtDeg(result.thetaDeg)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">Cut angle / end</th><td className="py-2 text-[#F5F7FA]">{fmtDeg(result.cutAnglePerEndDeg)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
      )}
    </div>
  );
}

function Verification({ unitSystem, parseLength, fmt, fmtDeg }: SectionProps) {
  const { t } = useTranslation();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [h, setH] = useState('424.264');
  const [theta, setTheta] = useState('45');

  const { result, error } = useMemo(() => {
    const input: { a?: number; b?: number; h?: number; thetaDeg?: number } = {};
    if (a.trim()) input.a = parseLength(a);
    if (b.trim()) input.b = parseLength(b);
    if (h.trim()) input.h = parseLength(h);
    if (theta.trim()) input.thetaDeg = Number(theta);
    const provided = [input.a, input.b, input.h, input.thetaDeg].filter((v) => v !== undefined && Number.isFinite(v));
    if (provided.length !== 2) return { result: null, error: null };
    const res = solveOffsetVerificationPartial(input);
    if (res.success === false) {
      return { result: null, error: res.reason };
    }
    return { result: res.result, error: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, h, theta, unitSystem]);

  return (
    <div className="space-y-4 rounded-lg border border-[#232A36] bg-[#151A22] p-4">
      <p className="text-xs text-[#A3A9B3]">{t('tools.prefab.offset.verifyHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <LengthField label={t('tools.prefab.offset.a')} value={a} onChange={setA} />
        <LengthField label={t('tools.prefab.offset.b')} value={b} onChange={setB} />
        <LengthField label={t('tools.prefab.offset.h')} value={h} onChange={setH} />
        <LengthField label={t('tools.prefab.offset.theta')} value={theta} onChange={setTheta} unit="°" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <OffsetVerificationDiagram a={result.a} b={result.b} h={result.h} thetaDeg={result.thetaDeg} />
      )}
      {result ? (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-[#232A36]">
            <tr><th className="py-2 text-[#A3A9B3] font-normal">A</th><td className="py-2 text-[#F5F7FA]">{fmt(result.a)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">B</th><td className="py-2 text-[#F5F7FA]">{fmt(result.b)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">H</th><td className="py-2 text-[#F5F7FA]">{fmt(result.h)}</td></tr>
            <tr><th className="py-2 text-[#A3A9B3] font-normal">θ</th><td className="py-2 text-[#F5F7FA]">{fmtDeg(result.thetaDeg)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
      )}
    </div>
  );
}

function LengthField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">{label} {unit ? `(${unit})` : ''}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#0E1117] border-[#232A36]"
      />
    </div>
  );
}

function npsLabel(nps: string): string {
  return `${nps}"`;
}

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Copy, Droplets } from 'lucide-react';
import {
  PIPE_SIZES,
  getAvailableSchedules,
  getInnerDiameter,
  getWallThickness,
  calculateVolume,
  litersToM3,
  litersToGallons,
  type Schedule,
  type VolumeSegment,
} from './pipeData';

const fmt = (v: number, d = 2) => Number(v.toFixed(d)).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });

type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
const LENGTH_FACTORS: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

let nextId = 1;

interface SegmentInput {
  id: number;
  nps: string;
  schedule: Schedule;
  length: string;
  lengthUnit: LengthUnit;
}

export default function PipeVolume() {
  const { t } = useTranslation();
  const [segments, setSegments] = useState<SegmentInput[]>([
    { id: nextId++, nps: '6', schedule: 'STD', length: '6000', lengthUnit: 'mm' },
  ]);
  const [copied, setCopied] = useState(false);

  const addSegment = useCallback(() => {
    setSegments((prev) => [...prev, { id: nextId++, nps: '6', schedule: 'STD', length: '6000', lengthUnit: 'mm' }]);
  }, []);

  const removeSegment = useCallback((id: number) => {
    setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }, []);

  const updateSegment = useCallback((id: number, field: keyof SegmentInput, value: string) => {
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, [field]: value };
        // Reset schedule if NPS changed and current schedule isn't available
        if (field === 'nps') {
          const avail = getAvailableSchedules(value);
          if (!avail.includes(updated.schedule)) {
            updated.schedule = avail.includes('STD') ? 'STD' : avail[0] ?? 'STD';
          }
        }
        return updated;
      }),
    );
  }, []);

  const results = useMemo(() => {
    const segResults: VolumeSegment[] = [];
    let totalLiters = 0;

    for (const seg of segments) {
      const lengthNum = parseFloat(seg.length) || 0;
      const length_mm = lengthNum * LENGTH_FACTORS[seg.lengthUnit];
      const id_mm = getInnerDiameter(seg.nps, seg.schedule);
      if (!id_mm || length_mm <= 0) continue;

      const vol = calculateVolume(id_mm, length_mm);
      segResults.push({
        id: seg.id,
        nps: seg.nps,
        schedule: seg.schedule,
        length_mm,
        id_mm,
        volume_liters: vol,
      });
      totalLiters += vol;
    }

    return { segments: segResults, totalLiters };
  }, [segments]);

  const copyResult = useCallback(() => {
    const text = `${fmt(results.totalLiters)} L | ${fmt(litersToM3(results.totalLiters), 4)} m³ | ${fmt(litersToGallons(results.totalLiters))} gal`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0ea5e9]/10 border border-[#0ea5e9]/30">
          <Droplets className="h-5 w-5 text-[#0ea5e9]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            {t('tools.pipeVolume', { defaultValue: 'Pipe Volume Calculator' })}
          </h3>
          <p className="text-xs text-zinc-500">{t('volume.subtitle', { defaultValue: 'Hydrostatic testing · Line filling · Drainage' })}</p>
        </div>
      </div>

      {/* Segments */}
      <div className="space-y-3">
        {segments.map((seg, idx) => {
          const availSch = getAvailableSchedules(seg.nps);
          const wt = getWallThickness(seg.nps, seg.schedule);
          const pipe = PIPE_SIZES.find((p) => p.nps === seg.nps);
          const id_mm = pipe && wt ? pipe.od_mm - 2 * wt : undefined;
          const segResult = results.segments.find((r) => r.id === seg.id);

          return (
            <div key={seg.id} className="rounded-md border border-zinc-800 bg-[#0d0d0d] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {t('volume.segment', { defaultValue: 'Segment' })} {idx + 1}
                </span>
                {segments.length > 1 && (
                  <button onClick={() => removeSegment(seg.id)} className="text-zinc-600 hover:text-red-400 transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-500">NPS</Label>
                  <Select value={seg.nps} onValueChange={(v) => updateSegment(seg.id, 'nps', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIPE_SIZES.map((p) => (
                        <SelectItem key={p.nps} value={p.nps}>{p.nps}" (DN{p.dn})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Schedule</Label>
                  <Select value={seg.schedule} onValueChange={(v) => updateSegment(seg.id, 'schedule', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availSch.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {t('volume.length', { defaultValue: 'Length' })}
                  </Label>
                  <Input type="number" min="0" value={seg.length}
                    onChange={(e) => updateSegment(seg.id, 'length', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {t('volume.unit', { defaultValue: 'Unit' })}
                  </Label>
                  <Select value={seg.lengthUnit} onValueChange={(v) => updateSegment(seg.id, 'lengthUnit', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['mm', 'cm', 'm', 'in', 'ft'] as LengthUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Segment info */}
              <div className="flex gap-4 text-xs text-zinc-500">
                {pipe && <span>OD: {fmt(pipe.od_mm, 1)} mm</span>}
                {wt && <span>WT: {fmt(wt, 2)} mm</span>}
                {id_mm && <span className="text-[#0ea5e9]">ID: {fmt(id_mm, 1)} mm</span>}
                {segResult && <span className="ml-auto text-zinc-300">{fmt(segResult.volume_liters)} L</span>}
              </div>
            </div>
          );
        })}

        <button onClick={addSegment}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 py-2.5 text-xs text-zinc-400 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition">
          <Plus className="h-3.5 w-3.5" />
          {t('volume.addSegment', { defaultValue: 'Add Segment' })}
        </button>
      </div>

      {/* Total Results */}
      {results.totalLiters > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border-2 border-[#0ea5e9] bg-[#0ea5e9]/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#0ea5e9]">
                {t('volume.liters', { defaultValue: 'Liters' })}
              </p>
              <p className="mt-1 text-2xl font-bold text-[#0ea5e9]">{fmt(results.totalLiters)}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">m³</p>
              <p className="mt-1 text-lg font-bold text-zinc-100">{fmt(litersToM3(results.totalLiters), 4)}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">
                {t('volume.gallons', { defaultValue: 'US Gallons' })}
              </p>
              <p className="mt-1 text-lg font-bold text-zinc-100">{fmt(litersToGallons(results.totalLiters))}</p>
            </div>
          </div>

          {/* Formula */}
          <div className="rounded-md border border-zinc-800 bg-[#0d0d0d] p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              {t('volume.formula', { defaultValue: 'Formula' })}
            </p>
            <p className="font-mono text-xs text-zinc-300">
              V = π × (ID/2)² × L = π × r² × L
            </p>
            {results.segments.length > 1 && (
              <p className="font-mono text-xs text-zinc-500 mt-1">
                V_total = Σ V_i ({results.segments.length} {t('volume.segments', { defaultValue: 'segments' })})
              </p>
            )}
          </div>

          {/* Copy button */}
          <button onClick={copyResult}
            className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-300 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition">
            <Copy className="h-3.5 w-3.5" />
            {copied ? t('volume.copied', { defaultValue: 'Copied!' }) : t('volume.copyResult', { defaultValue: 'Copy Result' })}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Weight } from 'lucide-react';
import {
  MATERIALS,
  PROFILE_DEFINITIONS,
  weightPerMeter,
  sphereWeight,
  type ProfileType,
  type ProfileField,
} from './profileData';

const fmt = (v: number, d = 2) => Number(v.toFixed(d)).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });

// SVG cross-section renderers
function ProfileSVG({ profile, dims }: { profile: ProfileType; dims: Record<string, number> }) {
  const size = 120;
  const cx = size / 2, cy = size / 2;

  switch (profile) {
    case 'round-tube': {
      const or2 = 40, wt = Math.min(15, (dims.wt ?? 5) / (dims.od ?? 100) * 80);
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <circle cx={cx} cy={cy} r={or2} fill="none" stroke="#f59e0b" strokeWidth={wt} />
          <line x1={cx - or2 - 5} y1={cy} x2={cx + or2 + 5} y2={cy} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="2" />
          <text x={cx} y={cy - or2 - 8} fill="#71717a" fontSize="8" textAnchor="middle">Ø{fmt(dims.od ?? 0, 0)}</text>
        </svg>
      );
    }
    case 'square-tube': {
      const s = 60, wt = Math.min(10, 4);
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="none" stroke="#f59e0b" strokeWidth={wt} rx="1" />
        </svg>
      );
    }
    case 'rect-tube': {
      const w = 70, h = 45, wt = 4;
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="none" stroke="#f59e0b" strokeWidth={wt} rx="1" />
        </svg>
      );
    }
    case 'plate': {
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <rect x={20} y={cy - 6} width={80} height={12} fill="#f59e0b" fillOpacity="0.3" stroke="#f59e0b" strokeWidth="1.5" />
          <text x={cx} y={cy + 25} fill="#71717a" fontSize="8" textAnchor="middle">W × T</text>
        </svg>
      );
    }
    case 'round-bar': {
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <circle cx={cx} cy={cy} r={35} fill="#f59e0b" fillOpacity="0.2" stroke="#f59e0b" strokeWidth="1.5" />
        </svg>
      );
    }
    case 'square-bar': {
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <rect x={cx - 30} y={cy - 30} width={60} height={60} fill="#f59e0b" fillOpacity="0.2" stroke="#f59e0b" strokeWidth="1.5" rx="1" />
        </svg>
      );
    }
    case 'solid-sphere': {
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <circle cx={cx} cy={cy} r={40} fill="#f59e0b" fillOpacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
          <ellipse cx={cx} cy={cy} rx={40} ry={12} fill="none" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3" />
        </svg>
      );
    }
    case 'hollow-sphere': {
      const wt = 4;
      return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <circle cx={cx} cy={cy} r={40} fill="none" stroke="#f59e0b" strokeWidth={wt} />
          <circle cx={cx} cy={cy} r={40 - wt * 2} fill="none" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="2" />
        </svg>
      );
    }
    default:
      return null;
  }
}

export default function WeightCalculator() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en';

  const [profile, setProfile] = useState<ProfileType>('round-tube');
  const [materialKey, setMaterialKey] = useState('carbon-steel');
  const [customDensity, setCustomDensity] = useState('');
  const [length, setLength] = useState('6000');
  const [quantity, setQuantity] = useState('1');
  const [dims, setDims] = useState<Record<string, string>>({ od: '168.3', wt: '7.11' });
  const [copied, setCopied] = useState(false);

  const profileDef = PROFILE_DEFINITIONS.find((p) => p.key === profile)!;
  const material = MATERIALS.find((m) => m.key === materialKey)!;
  const density = customDensity ? parseFloat(customDensity) || material.density : material.density;
  const isSphere = profile === 'solid-sphere' || profile === 'hollow-sphere';

  const numDims = useMemo(() => {
    const d: Record<string, number> = {};
    for (const f of profileDef.fields) {
      d[f.key] = parseFloat(dims[f.key] ?? '0') || 0;
    }
    return d;
  }, [dims, profileDef]);

  const result = useMemo(() => {
    if (isSphere) {
      const totalWeight = sphereWeight(profile as 'solid-sphere' | 'hollow-sphere', numDims, density);
      const qty = parseInt(quantity) || 1;
      return { kgPerM: 0, pieceWeight: totalWeight, totalWeight: totalWeight * qty, isSphere: true };
    }

    const kgPerM = weightPerMeter(profile, numDims, density);
    const l_mm = parseFloat(length) || 0;
    const pieceWeight = kgPerM * (l_mm / 1000);
    const qty = parseInt(quantity) || 1;
    return { kgPerM, pieceWeight, totalWeight: pieceWeight * qty, isSphere: false };
  }, [profile, numDims, density, length, quantity, isSphere]);

  const updateDim = useCallback((key: string, value: string) => {
    setDims((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Reset dims when profile changes
  const handleProfileChange = useCallback((p: string) => {
    setProfile(p as ProfileType);
    const def = PROFILE_DEFINITIONS.find((d) => d.key === p);
    if (def) {
      const newDims: Record<string, string> = {};
      for (const f of def.fields) {
        newDims[f.key] = f.key === 'od' ? '168.3' : f.key === 'wt' ? '7.11' : f.key === 'side' ? '100' : f.key === 'width' ? '200' : f.key === 'height' ? '100' : f.key === 'thickness' ? '10' : '0';
      }
      setDims(newDims);
    }
  }, []);

  const copyResult = useCallback(() => {
    const text = result.isSphere
      ? `${fmt(result.pieceWeight, 3)} kg × ${quantity} = ${fmt(result.totalWeight, 3)} kg`
      : `${fmt(result.kgPerM, 3)} kg/m × ${length} mm × ${quantity} = ${fmt(result.totalWeight, 3)} kg`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result, length, quantity]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f59e0b]/10 border border-[#f59e0b]/30">
          <Weight className="h-5 w-5 text-[#f59e0b]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            {t('tools.weightCalc', { defaultValue: 'Weight Calculator' })}
          </h3>
          <p className="text-xs text-zinc-500">{t('weight.subtitle', { defaultValue: 'Engineering · Logistics · Lifting · Procurement' })}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              {t('weight.profile', { defaultValue: 'Profile' })}
            </Label>
            <Select value={profile} onValueChange={handleProfileChange}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROFILE_DEFINITIONS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {lang === 'es' ? p.name_es : p.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              {t('weight.material', { defaultValue: 'Material' })}
            </Label>
            <Select value={materialKey} onValueChange={setMaterialKey}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATERIALS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {lang === 'es' ? m.name_es : m.name_en} ({m.density.toLocaleString()} kg/m³)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              {t('weight.density', { defaultValue: 'Density (editable)' })} (kg/m³)
            </Label>
            <Input type="number" min="1" value={customDensity} placeholder={String(material.density)}
              onChange={(e) => setCustomDensity(e.target.value)}
              className="bg-zinc-950 border-zinc-800" />
          </div>

          {/* SVG cross-section */}
          <div className="border border-zinc-800 bg-[#0d0d0d] rounded-sm p-2 aspect-square flex items-center justify-center">
            <ProfileSVG profile={profile} dims={numDims} />
          </div>
        </div>

        {/* Dimensions + results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Profile dimensions */}
          <div className="grid gap-3 sm:grid-cols-2">
            {profileDef.fields.map((f: ProfileField) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {lang === 'es' ? f.label_es : f.label_en} ({f.unit})
                </Label>
                <Input type="number" min={f.min} step="0.1" value={dims[f.key] ?? ''}
                  onChange={(e) => updateDim(f.key, e.target.value)}
                  className="bg-zinc-950 border-zinc-800" />
              </div>
            ))}
          </div>

          {/* Length + quantity (not for spheres) */}
          {!isSphere && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {t('weight.length', { defaultValue: 'Length' })} (mm)
                </Label>
                <Input type="number" min="1" value={length} onChange={(e) => setLength(e.target.value)}
                  className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {t('weight.quantity', { defaultValue: 'Quantity' })}
                </Label>
                <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="bg-zinc-950 border-zinc-800" />
              </div>
            </div>
          )}

          {isSphere && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-zinc-500">
                {t('weight.quantity', { defaultValue: 'Quantity' })}
              </Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="bg-zinc-950 border-zinc-800 max-w-[200px]" />
            </div>
          )}

          {/* Results */}
          <div className="grid gap-3 sm:grid-cols-3">
            {!isSphere && (
              <div className="rounded-md border-2 border-[#f59e0b] bg-[#f59e0b]/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">kg/m</p>
                <p className="mt-1 text-2xl font-bold text-[#f59e0b]">{fmt(result.kgPerM, 3)}</p>
              </div>
            )}
            <div className={`rounded-md border p-4 ${isSphere ? 'border-2 border-[#f59e0b] bg-[#f59e0b]/10' : 'border-zinc-800 bg-zinc-950'}`}>
              <p className={`text-[10px] uppercase tracking-[0.25em] ${isSphere ? 'text-[#f59e0b]' : 'text-zinc-400'}`}>
                {t('weight.pieceWeight', { defaultValue: 'Piece Weight' })}
              </p>
              <p className={`mt-1 text-lg font-bold ${isSphere ? 'text-[#f59e0b]' : 'text-zinc-100'}`}>
                {fmt(result.pieceWeight, 3)} <span className="text-sm font-normal">kg</span>
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">
                {t('weight.totalWeight', { defaultValue: 'Total Weight' })} (×{quantity})
              </p>
              <p className="mt-1 text-lg font-bold text-zinc-100">
                {fmt(result.totalWeight, 3)} <span className="text-sm font-normal">kg</span>
              </p>
              {result.totalWeight >= 1000 && (
                <p className="text-xs text-zinc-500">{fmt(result.totalWeight / 1000, 3)} t</p>
              )}
            </div>
          </div>

          {/* Formula */}
          <div className="rounded-md border border-zinc-800 bg-[#0d0d0d] p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              {t('weight.formula', { defaultValue: 'Formula' })}
            </p>
            {isSphere ? (
              <p className="font-mono text-xs text-zinc-300">
                {profile === 'solid-sphere'
                  ? 'W = (4/3) × π × r³ × ρ'
                  : 'W = (4/3) × π × (R³ - r³) × ρ'}
              </p>
            ) : (
              <div className="font-mono text-xs text-zinc-300 space-y-0.5">
                <p>W/m = A × ρ / 10⁶</p>
                <p className="text-zinc-500">
                  A = {fmt(result.kgPerM > 0 ? (result.kgPerM * 1e6) / density : 0, 1)} mm² | ρ = {density.toLocaleString()} kg/m³
                </p>
              </div>
            )}
          </div>

          {/* Copy button */}
          <button onClick={copyResult}
            className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] transition">
            <Copy className="h-3.5 w-3.5" />
            {copied ? t('weight.copied', { defaultValue: 'Copied!' }) : t('weight.copyResult', { defaultValue: 'Copy Result' })}
          </button>
        </div>
      </div>
    </div>
  );
}

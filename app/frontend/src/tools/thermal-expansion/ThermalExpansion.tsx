import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// FEAT-007: Thermal Expansion Calculator.
// dL = alpha * L * dT. Includes material presets and anchor force estimation.

interface MaterialPreset {
  name: string;
  alpha: number; // mm/m/°C (coefficient of thermal expansion)
  E: number; // GPa (Young's modulus)
}

const MATERIALS: MaterialPreset[] = [
  { name: 'Carbon Steel', alpha: 0.0122, E: 200 },
  { name: 'Stainless 304', alpha: 0.0173, E: 193 },
  { name: 'Stainless 316', alpha: 0.0159, E: 193 },
  { name: 'Copper', alpha: 0.0166, E: 110 },
  { name: 'Aluminum', alpha: 0.0236, E: 70 },
  { name: 'CPVC', alpha: 0.063, E: 2.9 },
  { name: 'PP (Polypropylene)', alpha: 0.090, E: 1.3 },
];

export default function ThermalExpansion({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [length, setLength] = useState('10');
  const [matName, setMatName] = useState('Carbon Steel');
  const [tInitial, setTInitial] = useState('20');
  const [tOper, setTOper] = useState('150');

  const mat = MATERIALS.find((m) => m.name === matName) || MATERIALS[0];
  const L = parseFloat(length);
  const t1 = parseFloat(tInitial);
  const t2 = parseFloat(tOper);
  const dT = t2 - t1;

  const valid = L > 0 && isFinite(dT) && mat.alpha > 0;
  const dL = valid ? mat.alpha * L * dT : 0; // mm
  const dLperM = valid ? mat.alpha * dT : 0; // mm/m
  const dLin = valid ? dL / 25.4 : 0; // inches

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.thermalExpansion', { defaultValue: 'Thermal Expansion Calculator' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.thermalExpansionSubtitle', { defaultValue: 'ΔL = α · L · ΔT' })}
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Pipe Length (m)</Label>
          <Input value={length} onChange={(e) => setLength(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Material</Label>
          <Select value={matName} onValueChange={setMatName}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATERIALS.map((m) => (
                <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Initial Temp (°C)</Label>
          <Input value={tInitial} onChange={(e) => setTInitial(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Operating Temp (°C)</Label>
          <Input value={tOper} onChange={(e) => setTOper(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
      </div>

      {/* Material properties display */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">α (expansion coeff. mm/m·°C)</Label>
          <Input value={mat.alpha} readOnly className="bg-zinc-950 border-zinc-800 font-mono text-zinc-400" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">E (Young's modulus, GPa)</Label>
          <Input value={mat.E} readOnly className="bg-zinc-950 border-zinc-800 font-mono text-zinc-400" />
        </div>
      </div>

      {valid && (
        <div className="space-y-4">
          {/* Main result */}
          <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">Total Expansion</p>
            <p className="mt-1 text-3xl font-bold text-zinc-100 tabular-nums">
              {dL.toFixed(2)} mm
            </p>
            <p className="text-xs text-zinc-500">{dLin.toFixed(4)} in · ΔT = {dT}°C</p>
          </div>

          {/* Detailed results */}
          <div className="overflow-hidden rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Expansion per metre</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{dLperM.toFixed(4)} mm/m</td>
                </tr>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Total expansion</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{dL.toFixed(2)} mm · {dLin.toFixed(4)} in</td>
                </tr>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Temperature change (ΔT)</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{dT} °C</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-zinc-400">Recommended expansion loop</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-300">
                    {Math.abs(dL) > 0 ? `~${(Math.abs(dL) * 2).toFixed(0)} mm` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Material reference table */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {t('tools.materialRef', { defaultValue: 'Material Coefficients Reference' })}
            </p>
            <div className="overflow-x-auto rounded-md border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Material</th>
                    <th className="px-3 py-2 text-right">α (mm/m·°C)</th>
                    <th className="px-3 py-2 text-right">E (GPa)</th>
                  </tr>
                </thead>
                <tbody>
                  {MATERIALS.map((m) => (
                    <tr key={m.name} className={`border-t border-zinc-800/60 ${m.name === matName ? 'bg-[#f59e0b]/5' : ''}`}>
                      <td className="px-3 py-2 text-zinc-300">{m.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200">{m.alpha.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200">{m.E}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!valid && <p className="text-sm text-zinc-500">Enter valid values.</p>}
    </div>
  );
}

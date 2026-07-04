import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// QW-003: Pressure Drop Calculator. Darcy-Weisbach with Swamee-Jain friction factor.

interface FluidPreset {
  name: string;
  density: number;
  viscosity: number; // Pa.s
}

const FLUIDS: FluidPreset[] = [
  { name: 'Water 20°C', density: 998, viscosity: 0.001 },
  { name: 'Water 80°C', density: 972, viscosity: 0.000355 },
  { name: 'Crude Oil', density: 850, viscosity: 0.007 },
  { name: 'Diesel', density: 830, viscosity: 0.004 },
  { name: 'Steam (sat.)', density: 2.7, viscosity: 0.000017 },
  { name: 'Air (20°C, 1atm)', density: 1.2, viscosity: 0.000018 },
];

const ROUGHNESS: Record<string, number> = {
  'Carbon Steel': 0.045,
  'Stainless Steel': 0.015,
  'Copper': 0.0015,
  'PVC': 0.0015,
  'Concrete': 0.3,
};

export default function PressureDrop({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [diameter, setDiameter] = useState('100');
  const [length, setLength] = useState('100');
  const [flowRate, setFlowRate] = useState('10');
  const [fluidName, setFluidName] = useState('Water 20°C');
  const [roughnessKey, setRoughnessKey] = useState('Carbon Steel');

  const fluid = FLUIDS.find((f) => f.name === fluidName) || FLUIDS[0];
  const roughness = ROUGHNESS[roughnessKey] ?? 0.045;

  const D = parseFloat(diameter) / 1000; // mm → m
  const L = parseFloat(length); // m
  const Q = parseFloat(flowRate) / 3600; // m³/h → m³/s
  const rho = fluid.density;
  const mu = fluid.viscosity;

  const valid = D > 0 && L > 0 && Q > 0 && rho > 0 && mu > 0;

  const results = (() => {
    if (!valid) return null;
    const area = (Math.PI * D * D) / 4;
    const v = Q / area;
    const Re = (rho * v * D) / mu;
    const relRough = roughness / 1000 / D; // mm→m
    // Swamee-Jain explicit formula for friction factor
    const f =
      Re < 2300
        ? 64 / Re
        : 0.25 / Math.pow(Math.log10(relRough / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
    const dP = f * (L / D) * (rho * v * v) / 2; // Pa
    const dPbar = dP / 100000;
    const dPpsi = dP * 0.000145038;
    const regime =
      Re < 2300 ? 'Laminar' : Re < 4000 ? 'Transition' : 'Turbulent';
    const velocityWarning = rho > 10 ? v > 20 : v > 3;

    return { v, Re, f, dP, dPbar, dPpsi, regime, velocityWarning, area };
  })();

  const fmt = (n: number, d = 4) => (isFinite(n) ? n.toFixed(d) : '—');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.pressureDrop', { defaultValue: 'Pressure Drop Calculator' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.pressureDropSubtitle', { defaultValue: 'Darcy-Weisbach · Swamee-Jain' })}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">dP = f · (L/D) · (ρ·v²/2)</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Pipe ID (mm)</Label>
          <Input value={diameter} onChange={(e) => setDiameter(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Length (m)</Label>
          <Input value={length} onChange={(e) => setLength(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Flow rate (m³/h)</Label>
          <Input value={flowRate} onChange={(e) => setFlowRate(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Fluid</Label>
          <Select value={fluidName} onValueChange={setFluidName}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FLUIDS.map((f) => <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Pipe Material (roughness)</Label>
          <Select value={roughnessKey} onValueChange={setRoughnessKey}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(ROUGHNESS).map((k) => <SelectItem key={k} value={k}>{k} ({ROUGHNESS[k]} mm)</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {results && (
        <div className="space-y-4">
          {/* Main results */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">Pressure Drop</p>
              <p className="mt-1 text-xl font-bold text-zinc-100">{fmt(results.dPbar, 4)} bar</p>
              <p className="text-xs text-zinc-500">{fmt(results.dPpsi, 2)} psi · {fmt(results.dP / 1000, 2)} kPa</p>
            </div>
            <div className="border-l-2 border-zinc-700 bg-zinc-900/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Velocity</p>
              <p className="mt-1 text-xl font-bold text-zinc-100">{fmt(results.v, 2)} m/s</p>
              {results.velocityWarning && (
                <p className="text-xs text-red-400">⚠ High velocity</p>
              )}
            </div>
            <div className="border-l-2 border-zinc-700 bg-zinc-900/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Flow Regime</p>
              <p className="mt-1 text-xl font-bold text-zinc-100">{results.regime}</p>
              <p className="text-xs text-zinc-500">Re = {fmt(results.Re, 0)}</p>
            </div>
          </div>

          {/* Detailed results */}
          <div className="overflow-hidden rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Reynolds Number (Re)</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{fmt(results.Re, 0)}</td>
                </tr>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Friction Factor (f)</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{fmt(results.f, 6)}</td>
                </tr>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Flow Velocity</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{fmt(results.v, 4)} m/s</td>
                </tr>
                <tr className="border-b border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-400">Cross-section Area</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{fmt(results.area * 10000, 4)} cm²</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-zinc-400">Relative Roughness (ε/D)</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-100">{fmt((roughness / 1000) / D, 6)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!valid && (
        <p className="text-sm text-zinc-500">Enter valid positive values for all fields.</p>
      )}
    </div>
  );
}

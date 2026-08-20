import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// FEAT-006: Reynolds Number Calculator.
// Re = (rho * v * D) / mu. Determines flow regime (laminar/transition/turbulent).

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
  { name: 'Air (20°C)', density: 1.2, viscosity: 0.000018 },
];

export default function ReynoldsCalculator({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [diameter, setDiameter] = useState('100');
  const [velocity, setVelocity] = useState('1.5');
  const [fluidName, setFluidName] = useState('Water 20°C');

  const fluid = FLUIDS.find((f) => f.name === fluidName) || FLUIDS[0];
  const D = parseFloat(diameter) / 1000;
  const v = parseFloat(velocity);
  const rho = fluid.density;
  const mu = fluid.viscosity;

  const valid = D > 0 && v >= 0 && rho > 0 && mu > 0;
  const Re = valid ? (rho * v * D) / mu : 0;
  const regime = Re < 2300 ? 'laminar' : Re < 4000 ? 'transition' : 'turbulent';
  const regimeColor =
    regime === 'laminar' ? 'bg-emerald-500' : regime === 'transition' ? 'bg-amber-500' : 'bg-red-500';
  const regimeLabel =
    regime === 'laminar' ? 'Laminar (Re < 2300)' : regime === 'transition' ? 'Transition (2300–4000)' : 'Turbulent (Re > 4000)';

  // Visual bar position (log scale: 100 to 100000)
  const barPos = valid ? Math.min(100, Math.max(0, (Math.log10(Math.max(Re, 1)) - 2) / 3 * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.reynolds', { defaultValue: 'Reynolds Number Calculator' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.reynoldsSubtitle', { defaultValue: 'Re = (ρ · v · D) / μ' })}
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Pipe ID (mm)</Label>
          <Input value={diameter} onChange={(e) => setDiameter(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Velocity (m/s)</Label>
          <Input value={velocity} onChange={(e) => setVelocity(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
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
      </div>

      {/* Fluid properties (editable display) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Density (kg/m³)</Label>
          <Input value={fluid.density} readOnly className="bg-zinc-950 border-zinc-800 font-mono text-zinc-400" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Viscosity (Pa·s)</Label>
          <Input value={fluid.viscosity} readOnly className="bg-zinc-950 border-zinc-800 font-mono text-zinc-400" />
        </div>
      </div>

      {valid && (
        <div className="space-y-4">
          {/* Main result */}
          <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">Reynolds Number</p>
            <p className="mt-1 text-3xl font-bold text-zinc-100 tabular-nums">
              {Re.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-300">{regimeLabel}</p>
          </div>

          {/* Visual regime indicator */}
          <div className="space-y-2">
            <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
              {/* Gradient: green → amber → red */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 opacity-30" />
              {/* Marker */}
              <div
                className="absolute top-0 h-3 w-1 bg-white shadow-lg"
                style={{ left: `${barPos}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Laminar</span>
              <span>Transition</span>
              <span>Turbulent</span>
            </div>
          </div>
        </div>
      )}

      {!valid && (
        <p className="text-sm text-zinc-500">Enter valid positive values.</p>
      )}
    </div>
  );
}

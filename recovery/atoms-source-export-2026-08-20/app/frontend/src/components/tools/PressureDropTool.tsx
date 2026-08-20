import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';

interface FluidPreset {
  key: string;
  labelKey: string;
  density: number;
  viscosity: number;
}

const FLUID_PRESETS: FluidPreset[] = [
  { key: 'water20', labelKey: 'tools.pressureDrop.water20', density: 998, viscosity: 1.002 },
  { key: 'water80', labelKey: 'tools.pressureDrop.water80', density: 972, viscosity: 0.355 },
  { key: 'steam', labelKey: 'tools.pressureDrop.steam', density: 1.2, viscosity: 0.012 },
  { key: 'oil', labelKey: 'tools.pressureDrop.oil', density: 870, viscosity: 30 },
  { key: 'custom', labelKey: 'tools.pressureDrop.custom', density: 998, viscosity: 1.0 },
];

const ROUGHNESS_PRESETS: { key: string; labelKey: string; value: number }[] = [
  { key: 'cs', labelKey: 'tools.pressureDrop.carbonSteel', value: 0.045 },
  { key: 'ss', labelKey: 'tools.pressureDrop.stainless', value: 0.015 },
  { key: 'cu', labelKey: 'tools.pressureDrop.copper', value: 0.0015 },
  { key: 'pvc', labelKey: 'tools.pressureDrop.pvc', value: 0.0015 },
  { key: 'concrete', labelKey: 'tools.pressureDrop.concrete', value: 0.3 },
  { key: 'custom', labelKey: 'tools.pressureDrop.custom', value: 0.045 },
];

interface Fitting {
  key: string;
  labelKey: string;
  kFactor: number;
  count: number;
}

const DEFAULT_FITTINGS: Fitting[] = [
  { key: 'elbow90', labelKey: 'tools.pressureDrop.elbow90', kFactor: 0.9, count: 0 },
  { key: 'elbow45', labelKey: 'tools.pressureDrop.elbow45', kFactor: 0.4, count: 0 },
  { key: 'tee', labelKey: 'tools.pressureDrop.tee', kFactor: 1.8, count: 0 },
  { key: 'gateValve', labelKey: 'tools.pressureDrop.gateValve', kFactor: 0.2, count: 0 },
  { key: 'globeValve', labelKey: 'tools.pressureDrop.globeValve', kFactor: 10.0, count: 0 },
  { key: 'checkValve', labelKey: 'tools.pressureDrop.checkValve', kFactor: 2.5, count: 0 },
];

function swameeJain(Re: number, relRoughness: number): number {
  if (Re < 2300) return 64 / Re;
  const term = relRoughness / 3.7 + 5.74 / Math.pow(Re, 0.9);
  const f = 0.25 / Math.pow(Math.log10(term), 2);
  return f;
}

export default function PressureDropTool() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [pipeID, setPipeID] = useState('154.1');
  const [pipeLength, setPipeLength] = useState('100');
  const [flowRate, setFlowRate] = useState('50');
  const [fluidPreset, setFluidPreset] = useState('water20');
  const [density, setDensity] = useState('998');
  const [viscosity, setViscosity] = useState('1.002');
  const [roughnessPreset, setRoughnessPreset] = useState('cs');
  const [roughness, setRoughness] = useState('0.045');
  const [fittings, setFittings] = useState<Fitting[]>(DEFAULT_FITTINGS);

  const handleFluidChange = (key: string) => {
    setFluidPreset(key);
    const preset = FLUID_PRESETS.find(f => f.key === key);
    if (preset && key !== 'custom') {
      setDensity(String(preset.density));
      setViscosity(String(preset.viscosity));
    }
  };

  const handleRoughnessChange = (key: string) => {
    setRoughnessPreset(key);
    const preset = ROUGHNESS_PRESETS.find(r => r.key === key);
    if (preset && key !== 'custom') {
      setRoughness(String(preset.value));
    }
  };

  const updateFitting = (idx: number, count: number) => {
    setFittings(prev => prev.map((f, i) => i === idx ? { ...f, count } : f));
  };

  const results = useMemo(() => {
    const D = Number(pipeID) / 1000; // m
    const L = Number(pipeLength); // m
    const Q = Number(flowRate) / 3600; // m³/s
    const rho = Number(density); // kg/m³
    const mu = Number(viscosity) / 1000; // Pa·s
    const eps = Number(roughness) / 1000; // m

    if (!D || !L || !Q || !rho || !mu) return null;

    const A = Math.PI * (D / 2) ** 2;
    const v = Q / A;
    const Re = (rho * v * D) / mu;
    const relRoughness = eps / D;
    const f = swameeJain(Re, relRoughness);

    // Pipe friction loss
    const dP_pipe = f * (L / D) * (rho * v * v / 2); // Pa

    // Fittings loss
    const totalK = fittings.reduce((sum, fit) => sum + fit.kFactor * fit.count, 0);
    const dP_fittings = totalK * (rho * v * v / 2); // Pa

    const dP_total = dP_pipe + dP_fittings; // Pa

    let regime: string;
    if (Re < 2300) regime = 'laminar';
    else if (Re < 4000) regime = 'transition';
    else regime = 'turbulent';

    const isGas = rho < 10;
    const velocityWarning = isGas ? (v > 20) : (v > 3);

    return {
      dP_bar: dP_total / 1e5,
      dP_psi: dP_total / 6894.76,
      dP_kPa: dP_total / 1000,
      velocity: v,
      Re,
      frictionFactor: f,
      regime,
      velocityWarning,
      isGas,
    };
  }, [pipeID, pipeLength, flowRate, density, viscosity, roughness, fittings]);

  const handleSave = async () => {
    if (!user || !results) return;
    await supabase.from(TABLES.toolUsage).insert({
      user_id: user.id,
      tool_name: 'Pressure Drop',
      tool_category: 'Hydraulics',
      input_data: { pipeID: Number(pipeID), pipeLength: Number(pipeLength), flowRate: Number(flowRate), density: Number(density), viscosity: Number(viscosity), roughness: Number(roughness) },
      output_data: { dP_bar: results.dP_bar, velocity: results.velocity, Re: results.Re, regime: results.regime },
    });
    toast.success(t('tools.calculationSaved'));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.pressureDrop.name')}
        </p>
        <h3 className="mt-1 text-xl font-semibold">{t('tools.pressureDrop.subtitle')}</h3>
        <p className="mt-1 text-sm text-zinc-400">ΔP = f · (L/D) · (ρ·v²/2)</p>
      </div>

      {/* Pipe inputs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.pipeID')}
          </Label>
          <Input value={pipeID} onChange={(e) => setPipeID(e.target.value)}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.pipeLength')}
          </Label>
          <Input value={pipeLength} onChange={(e) => setPipeLength(e.target.value)}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.flowRateLabel')}
          </Label>
          <Input value={flowRate} onChange={(e) => setFlowRate(e.target.value)}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
      </div>

      {/* Fluid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.fluid')}
          </Label>
          <select value={fluidPreset} onChange={(e) => handleFluidChange(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            {FLUID_PRESETS.map(f => <option key={f.key} value={f.key}>{t(f.labelKey)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.density')} (kg/m³)
          </Label>
          <Input value={density} onChange={(e) => setDensity(e.target.value)}
            disabled={fluidPreset !== 'custom'}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] disabled:opacity-50" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.viscosity')} (cP)
          </Label>
          <Input value={viscosity} onChange={(e) => setViscosity(e.target.value)}
            disabled={fluidPreset !== 'custom'}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] disabled:opacity-50" />
        </div>
      </div>

      {/* Roughness */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.pipeMaterial')}
          </Label>
          <select value={roughnessPreset} onChange={(e) => handleRoughnessChange(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            {ROUGHNESS_PRESETS.map(r => <option key={r.key} value={r.key}>{t(r.labelKey)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('tools.pressureDrop.roughness')} (mm)
          </Label>
          <Input value={roughness} onChange={(e) => setRoughness(e.target.value)}
            disabled={roughnessPreset !== 'custom'}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] disabled:opacity-50" />
        </div>
      </div>

      {/* Fittings */}
      <div className="border border-zinc-800/80 bg-zinc-950 p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
          {t('tools.pressureDrop.fittings')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fittings.map((fit, idx) => (
            <div key={fit.key} className="flex items-center gap-2">
              <Input
                type="number" min="0" value={fit.count}
                onChange={(e) => updateFitting(idx, Math.max(0, Number(e.target.value)))}
                className="w-16 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] text-center"
              />
              <span className="text-xs text-zinc-400">{t(fit.labelKey)}</span>
              <span className="text-[10px] text-zinc-600 ml-auto">K={fit.kFactor}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="border border-zinc-800/80 bg-zinc-950 p-4 space-y-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#f59e0b]">
            {t('common.result')}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="border border-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">ΔP</p>
              <p className="text-lg font-mono text-[#f59e0b]">{results.dP_bar.toFixed(4)} bar</p>
              <p className="text-xs text-zinc-400">{results.dP_psi.toFixed(2)} psi · {results.dP_kPa.toFixed(2)} kPa</p>
            </div>
            <div className={`border p-3 ${results.velocityWarning ? 'border-red-500/50 bg-red-500/5' : 'border-zinc-800/50'}`}>
              <p className="text-[10px] text-zinc-500 uppercase">{t('tools.pressureDrop.velocity')}</p>
              <p className={`text-lg font-mono ${results.velocityWarning ? 'text-red-400' : 'text-zinc-100'}`}>
                {results.velocity.toFixed(3)} m/s
              </p>
              {results.velocityWarning && (
                <p className="text-[10px] text-red-400">
                  ⚠ {results.isGas ? t('tools.pressureDrop.warnGas') : t('tools.pressureDrop.warnLiquid')}
                </p>
              )}
            </div>
            <div className="border border-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">Reynolds</p>
              <p className="text-lg font-mono text-zinc-100">{results.Re.toFixed(0)}</p>
              <p className="text-xs text-zinc-400">{t(`tools.pressureDrop.${results.regime}`)}</p>
            </div>
            <div className="border border-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">{t('tools.pressureDrop.frictionFactor')}</p>
              <p className="text-lg font-mono text-zinc-100">{results.frictionFactor.toFixed(6)}</p>
            </div>
            <div className="border border-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">{t('tools.pressureDrop.flowRegime')}</p>
              <p className="text-lg font-mono text-zinc-100 capitalize">{t(`tools.pressureDrop.${results.regime}`)}</p>
            </div>
          </div>

          <Button onClick={handleSave} className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
            {t('tools.branchLayout.saveCalc')}
          </Button>
        </div>
      )}
    </div>
  );
}
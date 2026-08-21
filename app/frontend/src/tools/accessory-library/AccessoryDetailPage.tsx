import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Layers,
  Link2,
  Settings2,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─────────────────────────────────────────────
   Types & Data
   ───────────────────────────────────────────── */

interface AccessoryDetailPageProps {
  accessoryId: string;
  onBack: () => void;
}

type UnitSystem = 'metric' | 'imperial';
type ViewMode = 'obra' | 'ingenieria';
type TabKey = 'vista-rapida' | 'dimensiones' | 'normativa' | 'compatibilidades' | 'descargas';

interface DimensionRow {
  nps: string;
  dn: number;
  od: number;
  wt: number;
  a: number;
  radioLR: number;
}

const DIMENSION_DATA: DimensionRow[] = [
  { nps: '2"', dn: 50, od: 60.33, wt: 3.91, a: 76.2, radioLR: 76.2 },
  { nps: '3"', dn: 80, od: 88.9, wt: 5.49, a: 114.3, radioLR: 114.3 },
  { nps: '4"', dn: 100, od: 114.3, wt: 6.02, a: 152.4, radioLR: 152.4 },
  { nps: '6"', dn: 150, od: 168.28, wt: 7.11, a: 228.6, radioLR: 228.6 },
  { nps: '8"', dn: 200, od: 219.08, wt: 8.18, a: 304.8, radioLR: 304.8 },
  { nps: '10"', dn: 250, od: 273.05, wt: 9.27, a: 381.0, radioLR: 381.0 },
  { nps: '12"', dn: 300, od: 323.85, wt: 10.31, a: 457.2, radioLR: 457.2 },
];

const SCHEDULES = ['Sch 10', 'Sch 20', 'Sch 40', 'Sch 80', 'Sch 160'] as const;

const TABS_OBRA: { key: TabKey; labelKey: string; icon: typeof Eye }[] = [
  { key: 'vista-rapida', labelKey: 'Vista Rápida', icon: Eye },
];

const TABS_INGENIERIA: { key: TabKey; labelKey: string; icon: typeof Eye }[] = [
  { key: 'vista-rapida', labelKey: 'Vista Rápida', icon: Eye },
  { key: 'dimensiones', labelKey: 'Dimensiones', icon: Layers },
  { key: 'normativa', labelKey: 'Normativa', icon: FileText },
  { key: 'compatibilidades', labelKey: 'Compatibilidades', icon: Link2 },
  { key: 'descargas', labelKey: 'Descargas', icon: Download },
];

/* ─────────────────────────────────────────────
   SVG Drawing of Elbow 90° LR BW
   ───────────────────────────────────────────── */

function ElbowSVG({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer arc */}
      <path
        d="M 40 160 A 80 80 0 0 1 160 40"
        stroke="#a1a1aa"
        strokeWidth="2"
        fill="none"
      />
      {/* Inner arc */}
      <path
        d="M 60 160 A 60 60 0 0 1 160 60"
        stroke="#a1a1aa"
        strokeWidth="2"
        fill="none"
      />
      {/* End faces (bevel lines) */}
      <line x1="40" y1="160" x2="60" y2="160" stroke="#f59e0b" strokeWidth="2" />
      <line x1="160" y1="40" x2="160" y2="60" stroke="#f59e0b" strokeWidth="2" />
      {/* Center line (dashed) */}
      <path
        d="M 50 160 A 70 70 0 0 1 160 50"
        stroke="#71717a"
        strokeWidth="1"
        strokeDasharray="4 3"
        fill="none"
      />
      {/* Dimension arrow A */}
      <line x1="50" y1="175" x2="50" y2="190" stroke="#71717a" strokeWidth="0.5" />
      <line x1="160" y1="175" x2="160" y2="190" stroke="#71717a" strokeWidth="0.5" />
      <line x1="50" y1="185" x2="160" y2="185" stroke="#71717a" strokeWidth="0.5" />
      <text x="95" y="195" fill="#a1a1aa" fontSize="8" textAnchor="middle" fontFamily="monospace">A</text>
      {/* Radius indicator */}
      <circle cx="160" cy="160" r="2" fill="#f59e0b" />
      <line x1="160" y1="160" x2="110" y2="110" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3 2" />
      <text x="125" y="140" fill="#f59e0b" fontSize="7" fontFamily="monospace">R=1.5D</text>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */

export default function AccessoryDetailPage({ onBack }: AccessoryDetailPageProps) {
  const { t } = useTranslation();
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [mode, setMode] = useState<ViewMode>('obra');
  const [activeTab, setActiveTab] = useState<TabKey>('vista-rapida');
  const [consejoOpen, setConsejoOpen] = useState(false);
  const [selectedNps, setSelectedNps] = useState('2"');
  const [selectedSchedule, setSelectedSchedule] = useState('Sch 40');

  const tabs = mode === 'obra' ? TABS_OBRA : TABS_INGENIERIA;

  // When switching to ingeniería, default to dimensiones tab
  const handleModeSwitch = () => {
    if (mode === 'obra') {
      setMode('ingenieria');
      setActiveTab('dimensiones');
    } else {
      setMode('obra');
      setActiveTab('vista-rapida');
    }
  };

  return (
    <div className="min-h-full space-y-0" style={{ background: '#0a0a0a' }}>
      {/* ═══ ZONE A — Header ═══ */}
      <div className="rounded-t-xl border border-zinc-800/80 bg-[#0d0d0d] p-5 space-y-4">
        {/* Back + Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-zinc-400 hover:text-amber-500 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('common.back', { defaultValue: 'Volver' })}</span>
          </button>
          <ChevronRight className="h-3 w-3" />
          <span>Biblioteca</span>
          <ChevronRight className="h-3 w-3" />
          <span>Butt Weld</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-zinc-300">Elbows</span>
        </div>

        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-100 font-sans">
              Codo 90° LR BW
            </h1>
            <p className="text-xs font-mono text-zinc-500">
              PB-COMP-ELBOW-90-LR-BW-ASME-B16-9
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-500 border border-green-500/20">
              APROBADO
            </span>
            {/* Unit toggle */}
            <div className="flex rounded-md border border-zinc-800/80 overflow-hidden text-[11px]">
              <button
                onClick={() => setUnits('metric')}
                className={`px-3 py-1.5 transition-colors ${
                  units === 'metric'
                    ? 'bg-amber-500/10 text-amber-500 font-medium'
                    : 'bg-[#111] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Métrico
              </button>
              <button
                onClick={() => setUnits('imperial')}
                className={`px-3 py-1.5 transition-colors ${
                  units === 'imperial'
                    ? 'bg-amber-500/10 text-amber-500 font-medium'
                    : 'bg-[#111] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Imperial
              </button>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleModeSwitch}
            className="flex items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#111] px-3 py-1.5 text-[11px] text-zinc-400 hover:text-amber-500 hover:border-amber-500/30 transition-all"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {mode === 'obra' ? 'Modo Obra' : 'Modo Ingeniería'}
          </button>
          <span className="text-[10px] text-zinc-600">
            {mode === 'obra' ? '(simplificado)' : '(completo)'}
          </span>
        </div>
      </div>

      {/* ═══ ZONE B — Tabs ═══ */}
      <div className="border-x border-zinc-800/80 bg-[#0d0d0d]">
        {/* Desktop tabs */}
        <div className="hidden sm:flex border-b border-zinc-800/80">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.labelKey}
              </button>
            );
          })}
        </div>
        {/* Mobile accordion tabs */}
        <div className="sm:hidden border-b border-zinc-800/80 px-4 py-2">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as TabKey)}
            className="w-full rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300"
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.labelKey}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ═══ Tab Content ═══ */}
      <div className="rounded-b-xl border border-t-0 border-zinc-800/80 bg-[#0d0d0d] p-5">
        {activeTab === 'vista-rapida' && (
          <VistaRapidaTab
            units={units}
            consejoOpen={consejoOpen}
            setConsejoOpen={setConsejoOpen}
            onSwitchMode={handleModeSwitch}
          />
        )}
        {activeTab === 'dimensiones' && (
          <DimensionesTab
            units={units}
            selectedNps={selectedNps}
            setSelectedNps={setSelectedNps}
            selectedSchedule={selectedSchedule}
            setSelectedSchedule={setSelectedSchedule}
          />
        )}
        {activeTab === 'normativa' && <NormativaTab />}
        {activeTab === 'compatibilidades' && <CompatibilidadesTab />}
        {activeTab === 'descargas' && <DescargasTab />}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Vista Rápida
   ───────────────────────────────────────────── */

function VistaRapidaTab({
  units,
  consejoOpen,
  setConsejoOpen,
  onSwitchMode,
}: {
  units: UnitSystem;
  consejoOpen: boolean;
  setConsejoOpen: (v: boolean) => void;
  onSwitchMode: () => void;
}) {
  const summaryRows = DIMENSION_DATA.slice(0, 4);

  return (
    <div className="space-y-5">
      {/* Image + Data layout */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: Image */}
        <div className="flex items-center justify-center rounded-lg bg-[#111] border border-zinc-800/80 p-6 aspect-square max-h-[320px]">
          <ElbowSVG className="w-full h-full max-w-[280px]" />
        </div>

        {/* Right: Key data + Summary table */}
        <div className="space-y-4">
          {/* Key data */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <DataChip label="NPS" value="2&quot;" />
              <DataChip label="DN" value="50" />
              <DataChip label="OD" value={units === 'metric' ? '60.33 mm' : '2.375 in'} />
              <DataChip label="Conexión" value="BW" />
              <DataChip label="Radio" value="LR 1.5D" />
              <DataChip label="Norma" value="ASME B16.9" />
            </div>
          </div>

          {/* Summary table */}
          <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-[#111]">
                  <th className="px-3 py-2 text-left font-medium text-zinc-400">NPS</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-400">DN</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-400">
                    OD {units === 'metric' ? '(mm)' : '(in)'}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-400">
                    WT {units === 'metric' ? '(mm)' : '(in)'}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-400">
                    A {units === 'metric' ? '(mm)' : '(in)'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr
                    key={row.nps}
                    className="border-b border-zinc-800/50 last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-zinc-100">{row.nps}</td>
                    <td className="px-3 py-2 font-mono text-zinc-300">{row.dn}</td>
                    <td className="px-3 py-2 font-mono text-zinc-300">
                      {units === 'metric' ? row.od.toFixed(2) : (row.od / 25.4).toFixed(3)}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-300">
                      {units === 'metric' ? row.wt.toFixed(2) : (row.wt / 25.4).toFixed(3)}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-300">
                      {units === 'metric' ? row.a.toFixed(1) : (row.a / 25.4).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Accordion: Consejo del tubero */}
      <div className="rounded-lg border border-zinc-800/80 bg-[#111]">
        <button
          onClick={() => setConsejoOpen(!consejoOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            Consejo del tubero
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${consejoOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {consejoOpen && (
          <div className="border-t border-zinc-800/80 px-4 py-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              No usar en líneas de alto pulso sin análisis adicional. Verificar siempre el radio
              disponible en el rack antes de seleccionar LR vs SR.
            </p>
          </div>
        )}
      </div>

      {/* CTA: Ver ficha completa */}
      <Button
        onClick={onSwitchMode}
        className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-black font-medium text-sm"
      >
        <Eye className="mr-2 h-4 w-4" />
        Ver ficha completa (Modo Ingeniería)
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Dimensiones
   ───────────────────────────────────────────── */

function DimensionesTab({
  units,
  selectedNps,
  setSelectedNps,
  selectedSchedule,
  setSelectedSchedule,
}: {
  units: UnitSystem;
  selectedNps: string;
  setSelectedNps: (v: string) => void;
  selectedSchedule: string;
  setSelectedSchedule: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">NPS</label>
          <select
            value={selectedNps}
            onChange={(e) => setSelectedNps(e.target.value)}
            className="rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 min-w-[80px]"
          >
            {DIMENSION_DATA.map((row) => (
              <option key={row.nps} value={row.nps}>
                {row.nps}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Schedule</label>
          <select
            value={selectedSchedule}
            onChange={(e) => setSelectedSchedule(e.target.value)}
            className="rounded-md border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 min-w-[100px]"
          >
            {SCHEDULES.map((sch) => (
              <option key={sch} value={sch}>
                {sch}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Full dimension table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-[#111]">
              <th className="px-3 py-2 text-left font-medium text-zinc-400">NPS</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-400">DN</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-400">
                OD {units === 'metric' ? '(mm)' : '(in)'}
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-400">
                WT {units === 'metric' ? '(mm)' : '(in)'}
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-400">
                A {units === 'metric' ? '(mm)' : '(in)'}
              </th>
              <th className="px-3 py-2 text-left font-medium text-zinc-400">
                Radio LR {units === 'metric' ? '(mm)' : '(in)'}
              </th>
            </tr>
          </thead>
          <tbody>
            {DIMENSION_DATA.map((row) => (
              <tr
                key={row.nps}
                className={`border-b border-zinc-800/50 last:border-0 transition-colors ${
                  row.nps === selectedNps
                    ? 'bg-amber-500/5 border-l-2 border-l-amber-500'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <td className="px-3 py-2 font-mono text-zinc-100 font-medium">{row.nps}</td>
                <td className="px-3 py-2 font-mono text-zinc-300">{row.dn}</td>
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {units === 'metric' ? row.od.toFixed(2) : (row.od / 25.4).toFixed(3)}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {units === 'metric' ? row.wt.toFixed(2) : (row.wt / 25.4).toFixed(3)}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {units === 'metric' ? row.a.toFixed(1) : (row.a / 25.4).toFixed(3)}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {units === 'metric' ? row.radioLR.toFixed(1) : (row.radioLR / 25.4).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Technical drawing placeholder */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800/80 bg-[#111] p-6 flex flex-col items-center justify-center min-h-[200px]">
          <ElbowSVG className="w-40 h-40 opacity-80" />
          <p className="mt-3 text-[10px] uppercase tracking-wider text-zinc-500">
            Plano técnico SVG
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-zinc-700 bg-[#0a0a0a] p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="rounded-full bg-zinc-800/50 p-3 mb-3">
            <Layers className="h-6 w-6 text-zinc-600" />
          </div>
          <p className="text-xs text-zinc-500 text-center">
            Modelo 3D — disponible en MVP 2
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Normativa
   ───────────────────────────────────────────── */

function NormativaTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800/80 bg-[#111] p-4 space-y-3">
        <h4 className="text-sm font-medium text-zinc-100">Normas aplicables</h4>
        <ul className="space-y-2 text-xs text-zinc-400">
          <li className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <span><strong className="text-zinc-300">ASME B16.9</strong> — Factory-Made Wrought Buttwelding Fittings</span>
          </li>
          <li className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <span><strong className="text-zinc-300">ASME B31.3</strong> — Process Piping (tolerancias y requisitos de instalación)</span>
          </li>
          <li className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <span><strong className="text-zinc-300">ASTM A234</strong> — Piping Fittings of Wrought Carbon Steel and Alloy Steel</span>
          </li>
        </ul>
      </div>
      <div className="rounded-lg border border-zinc-800/80 bg-[#111] p-4 space-y-2">
        <h4 className="text-sm font-medium text-zinc-100">Materiales comunes</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-[#0a0a0a] border border-zinc-800/50 px-3 py-2">
            <span className="text-zinc-500">Carbon Steel</span>
            <p className="font-mono text-zinc-300 mt-0.5">A234 WPB</p>
          </div>
          <div className="rounded-md bg-[#0a0a0a] border border-zinc-800/50 px-3 py-2">
            <span className="text-zinc-500">Stainless 304</span>
            <p className="font-mono text-zinc-300 mt-0.5">A403 WP304</p>
          </div>
          <div className="rounded-md bg-[#0a0a0a] border border-zinc-800/50 px-3 py-2">
            <span className="text-zinc-500">Stainless 316</span>
            <p className="font-mono text-zinc-300 mt-0.5">A403 WP316</p>
          </div>
          <div className="rounded-md bg-[#0a0a0a] border border-zinc-800/50 px-3 py-2">
            <span className="text-zinc-500">Low Temp</span>
            <p className="font-mono text-zinc-300 mt-0.5">A420 WPL6</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Compatibilidades
   ───────────────────────────────────────────── */

function CompatibilidadesTab() {
  const compatItems = [
    {
      label: 'Pipe (BW)',
      detail: 'ver tabla de schedules',
      children: ['Sch 10', 'Sch 40', 'Sch 80', 'Sch 160'],
    },
    {
      label: 'Flange (WN/SO)',
      detail: 'clases 150 / 300 / 600',
      children: ['Class 150', 'Class 300', 'Class 600'],
    },
    {
      label: 'Valve (BW)',
      detail: 'tipos compatibles',
      children: ['Gate', 'Globe', 'Check', 'Ball'],
    },
    {
      label: 'Gasket',
      detail: 'según rating',
      children: ['Spiral Wound', 'Ring Joint'],
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400 mb-3">
        Este codo se conecta con:
      </p>
      {compatItems.map((item, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-zinc-800/80 bg-[#111] p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-medium text-zinc-100">{item.label}</span>
            <span className="text-[10px] text-zinc-500">→ {item.detail}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.children.map((child) => (
              <span
                key={child}
                className="rounded-md bg-[#0a0a0a] border border-zinc-800/50 px-2 py-1 text-[11px] text-zinc-400"
              >
                {child}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Tab: Descargas
   ───────────────────────────────────────────── */

function DescargasTab() {
  const downloads = [
    { name: 'Ficha técnica PDF', format: 'PDF', size: '~120 KB' },
    { name: 'Plano 2D (DXF)', format: 'DXF', size: '~45 KB' },
    { name: 'Modelo 3D (STEP)', format: 'STEP', size: 'MVP 2' },
    { name: 'Tabla dimensiones (CSV)', format: 'CSV', size: '~8 KB' },
  ];

  return (
    <div className="space-y-3">
      {downloads.map((dl) => (
        <div
          key={dl.name}
          className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-[#111] p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
              <Download className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-200">{dl.name}</p>
              <p className="text-[10px] text-zinc-500">{dl.format} · {dl.size}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={dl.size === 'MVP 2'}
            className="border-zinc-800 !bg-transparent hover:!bg-zinc-800/50 text-zinc-400 text-[11px] disabled:opacity-30"
          >
            {dl.size === 'MVP 2' ? 'Próximamente' : 'Descargar'}
          </Button>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Helper: DataChip
   ───────────────────────────────────────────── */

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#111] border border-zinc-800/80 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-mono text-zinc-200 mt-0.5">{value}</p>
    </div>
  );
}
import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * QW-001: Unit Converter — the most-used tool by piping professionals in the field.
 *
 * Categories: Length, Pressure, Temperature, Mass, Volume, NPS↔DN, Area, Flow rate.
 * Real-time conversion (no Calculate button). Live "all units" table below.
 * NPS↔DN is a special tabular category (no formula, lookup table).
 *
 * Reference: ASME B36.10M for NPS↔DN mapping.
 */

type Unit = {
  id: string;
  label: string;
  // factor to base unit (value_in_base = value * factor). Temperature handled separately.
  toBase: number;
  fromBase: number;
};

type CategoryDef = {
  id: string;
  labelKey: string;
  units: Unit[];
  // For temperature (offset-based), override conversion
  customConvert?: (value: number, fromId: string, toId: string) => number;
};

// --- Length (base: metre) ---
const LENGTH_UNITS: Unit[] = [
  { id: 'mm', label: 'mm', toBase: 0.001, fromBase: 1000 },
  { id: 'cm', label: 'cm', toBase: 0.01, fromBase: 100 },
  { id: 'm', label: 'm', toBase: 1, fromBase: 1 },
  { id: 'in', label: 'in', toBase: 0.0254, fromBase: 39.3701 },
  { id: 'ft', label: 'ft', toBase: 0.3048, fromBase: 3.28084 },
  { id: 'yd', label: 'yd', toBase: 0.9144, fromBase: 1.09361 },
];

// --- Pressure (base: bar) ---
const PRESSURE_UNITS: Unit[] = [
  { id: 'bar', label: 'bar', toBase: 1, fromBase: 1 },
  { id: 'psi', label: 'psi', toBase: 0.0689476, fromBase: 14.5038 },
  { id: 'MPa', label: 'MPa', toBase: 10, fromBase: 0.1 },
  { id: 'kPa', label: 'kPa', toBase: 0.01, fromBase: 100 },
  { id: 'atm', label: 'atm', toBase: 1.01325, fromBase: 0.986923 },
  { id: 'kgf_cm2', label: 'kgf/cm²', toBase: 0.980665, fromBase: 1.01972 },
];

// --- Temperature (offset-based, special handling) ---
const TEMP_UNITS: Unit[] = [
  { id: 'C', label: '°C', toBase: 1, fromBase: 1 },
  { id: 'F', label: '°F', toBase: 1, fromBase: 1 },
  { id: 'K', label: 'K', toBase: 1, fromBase: 1 },
];

function tempConvert(value: number, fromId: string, toId: string): number {
  // Convert to Celsius first
  let celsius: number;
  if (fromId === 'C') celsius = value;
  else if (fromId === 'F') celsius = (value - 32) * (5 / 9);
  else celsius = value - 273.15; // K
  // Then to target
  if (toId === 'C') return celsius;
  if (toId === 'F') return celsius * (9 / 5) + 32;
  return celsius + 273.15; // K
}

// --- Mass (base: kilogram) ---
const MASS_UNITS: Unit[] = [
  { id: 'kg', label: 'kg', toBase: 1, fromBase: 1 },
  { id: 'lb', label: 'lb', toBase: 0.453592, fromBase: 2.20462 },
  { id: 'ton_m', label: 't (metric)', toBase: 1000, fromBase: 0.001 },
  { id: 'ton_i', label: 'ton (imperial)', toBase: 1016.05, fromBase: 0.000984207 },
];

// --- Volume (base: litre) ---
const VOLUME_UNITS: Unit[] = [
  { id: 'L', label: 'litres', toBase: 1, fromBase: 1 },
  { id: 'gal_us', label: 'gal (US)', toBase: 3.78541, fromBase: 0.264172 },
  { id: 'gal_uk', label: 'gal (UK)', toBase: 4.54609, fromBase: 0.219969 },
  { id: 'm3', label: 'm³', toBase: 1000, fromBase: 0.001 },
  { id: 'ft3', label: 'ft³', toBase: 28.3168, fromBase: 0.0353147 },
  { id: 'bbl', label: 'barrel', toBase: 158.987, fromBase: 0.00628981 },
];

// --- Area (base: m²) ---
const AREA_UNITS: Unit[] = [
  { id: 'mm2', label: 'mm²', toBase: 0.000001, fromBase: 1000000 },
  { id: 'cm2', label: 'cm²', toBase: 0.0001, fromBase: 10000 },
  { id: 'm2', label: 'm²', toBase: 1, fromBase: 1 },
  { id: 'in2', label: 'in²', toBase: 0.00064516, fromBase: 1550.0 },
  { id: 'ft2', label: 'ft²', toBase: 0.092903, fromBase: 10.7639 },
];

// --- Flow rate (base: m³/h) ---
const FLOW_UNITS: Unit[] = [
  { id: 'm3h', label: 'm³/h', toBase: 1, fromBase: 1 },
  { id: 'lmin', label: 'L/min', toBase: 0.06, fromBase: 16.6667 },
  { id: 'gpm', label: 'GPM (US)', toBase: 0.227125, fromBase: 4.40287 },
  { id: 'cfm', label: 'CFM', toBase: 1.69901, fromBase: 0.588578 },
];

// --- NPS ↔ DN (tabular, ASME B36.10M) ---
const NPS_DN_TABLE: { nps: string; dn: number; od_mm: number }[] = [
  { nps: '1/8"', dn: 6, od_mm: 10.3 },
  { nps: '1/4"', dn: 8, od_mm: 13.7 },
  { nps: '3/8"', dn: 10, od_mm: 17.1 },
  { nps: '1/2"', dn: 15, od_mm: 21.3 },
  { nps: '3/4"', dn: 20, od_mm: 26.7 },
  { nps: '1"', dn: 25, od_mm: 33.4 },
  { nps: '1-1/4"', dn: 32, od_mm: 42.2 },
  { nps: '1-1/2"', dn: 40, od_mm: 48.3 },
  { nps: '2"', dn: 50, od_mm: 60.3 },
  { nps: '2-1/2"', dn: 65, od_mm: 73.0 },
  { nps: '3"', dn: 80, od_mm: 88.9 },
  { nps: '4"', dn: 100, od_mm: 114.3 },
  { nps: '5"', dn: 125, od_mm: 141.3 },
  { nps: '6"', dn: 150, od_mm: 168.3 },
  { nps: '8"', dn: 200, od_mm: 219.1 },
  { nps: '10"', dn: 250, od_mm: 273.0 },
  { nps: '12"', dn: 300, od_mm: 323.8 },
  { nps: '14"', dn: 350, od_mm: 355.6 },
  { nps: '16"', dn: 400, od_mm: 406.4 },
  { nps: '18"', dn: 450, od_mm: 457.0 },
  { nps: '20"', dn: 500, od_mm: 508.0 },
  { nps: '24"', dn: 600, od_mm: 609.6 },
  { nps: '30"', dn: 750, od_mm: 762.0 },
  { nps: '36"', dn: 900, od_mm: 914.0 },
  { nps: '42"', dn: 1050, od_mm: 1067.0 },
  { nps: '48"', dn: 1200, od_mm: 1219.0 },
];

const CATEGORIES: CategoryDef[] = [
  { id: 'length', labelKey: 'tools.catLength', units: LENGTH_UNITS },
  { id: 'pressure', labelKey: 'tools.catPressure', units: PRESSURE_UNITS },
  { id: 'temperature', labelKey: 'tools.catTemperature', units: TEMP_UNITS, customConvert: tempConvert },
  { id: 'mass', labelKey: 'tools.catMass', units: MASS_UNITS },
  { id: 'volume', labelKey: 'tools.catVolume', units: VOLUME_UNITS },
  { id: 'area', labelKey: 'tools.catArea', units: AREA_UNITS },
  { id: 'flow', labelKey: 'tools.catFlow', units: FLOW_UNITS },
];

function convertValue(
  value: number,
  category: CategoryDef,
  fromId: string,
  toId: string
): number {
  if (category.customConvert) return category.customConvert(value, fromId, toId);
  const from = category.units.find((u) => u.id === fromId);
  const to = category.units.find((u) => u.id === toId);
  if (!from || !to) return NaN;
  const base = value * from.toBase;
  return base * to.fromBase;
}

function formatNum(n: number): string {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 100000 || abs < 0.0001) return n.toExponential(4);
  if (abs >= 100) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

export default function UnitConverter({ user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [categoryId, setCategoryId] = useState('length');
  const [fromId, setFromId] = useState('mm');
  const [toId, setToId] = useState('in');
  const [input, setInput] = useState('1');

  const category = useMemo(
    () => CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0],
    [categoryId]
  );

  const numericInput = parseFloat(input);
  const isValid = !isNaN(numericInput);
  const result = isValid ? convertValue(numericInput, category, fromId, toId) : NaN;

  const allConversions = useMemo(() => {
    if (!isValid) return [];
    return category.units.map((u) => ({
      unit: u,
      value: convertValue(numericInput, category, fromId, u.id),
    }));
  }, [numericInput, category, fromId]);

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
    if (isValid) setInput(formatNum(result).replace(/,/g, ''));
  };

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    const cat = CATEGORIES.find((c) => c.id === id);
    if (cat && cat.units.length >= 2) {
      setFromId(cat.units[0].id);
      setToId(cat.units[1].id);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.unitConverter', { defaultValue: 'Unit Converter' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.unitConverterSubtitle', {
            defaultValue: 'Real-time conversion across 7 categories + NPS↔DN table',
          })}
        </h3>
      </div>

      {/* Category selector */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-zinc-400">
          {t('tools.category', { defaultValue: 'Category' })}
        </Label>
        <Select value={categoryId} onValueChange={onCategoryChange}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {t(c.labelKey, { defaultValue: c.id })}
              </SelectItem>
            ))}
            <SelectItem value="nps-dn">
              {t('tools.catNpsDn', { defaultValue: 'NPS ↔ DN (pipe size)' })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {categoryId === 'nps-dn' ? (
        <NpsDnTable />
      ) : (
        <>
          {/* From / To converters */}
          <div className="grid gap-4 sm:grid-cols-[1fr,auto,1fr] sm:items-end">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('tools.from', { defaultValue: 'From' })}
              </Label>
              <Input
                type="number"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {category.units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={swap}
              className="mb-1 border-zinc-800 bg-transparent hover:bg-zinc-900"
              aria-label={t('tools.swap', { defaultValue: 'Swap units' })}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('tools.to', { defaultValue: 'To' })}
              </Label>
              <Input
                readOnly
                value={isValid ? formatNum(result) : '—'}
                className="bg-zinc-950 border-zinc-800 font-semibold text-[#f59e0b]"
              />
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {category.units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* All-units table */}
          {isValid && allConversions.length > 0 && (
            <div className="overflow-hidden rounded-md border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {allConversions.map(({ unit, value }) => (
                    <tr
                      key={unit.id}
                      className={`border-t border-zinc-800/60 ${
                        unit.id === toId ? 'bg-[#f59e0b]/5' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-zinc-300">{unit.label}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-100">
                        {formatNum(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* user prop is accepted for interface consistency with future tool registry;
          anonymous use does not save to DB (DEC-16). */}
      <span className="hidden">{user ? '' : ''}</span>
    </div>
  );
}

function NpsDnTable() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return NPS_DN_TABLE;
    return NPS_DN_TABLE.filter(
      (r) =>
        r.nps.toLowerCase().includes(q) ||
        String(r.dn).includes(q) ||
        String(r.od_mm).includes(q)
    );
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-zinc-400">
          {t('tools.search', { defaultValue: 'Search by NPS, DN, or OD' })}
        </Label>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder='e.g. 6" or 150 or 168'
          className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">NPS</th>
              <th className="px-3 py-2 text-right">DN</th>
              <th className="px-3 py-2 text-right">OD (mm)</th>
              <th className="px-3 py-2 text-right">OD (in)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.nps} className="border-t border-zinc-800/60">
                <td className="px-3 py-2 font-semibold text-zinc-100">{r.nps}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-300">{r.dn}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-100">{r.od_mm}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {(r.od_mm / 25.4).toFixed(3)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  {t('tools.noResults', { defaultValue: 'No matching sizes' })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-600">
        {t('tools.npsDnRef', {
          defaultValue: 'Reference: ASME B36.10M. OD = Outside Diameter.',
        })}
      </p>
    </div>
  );
}

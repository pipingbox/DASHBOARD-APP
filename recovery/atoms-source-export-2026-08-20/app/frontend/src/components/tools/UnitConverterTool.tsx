import { useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';

type UnitCategory =
  | 'length'
  | 'pressure'
  | 'temperature'
  | 'weight'
  | 'volume'
  | 'area'
  | 'flowRate'
  | 'npsDn';

interface UnitDef {
  key: string;
  label: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

const CATEGORIES: Record<
  Exclude<UnitCategory, 'npsDn'>,
  { labelKey: string; units: UnitDef[] }
> = {
  length: {
    labelKey: 'tools.unitConv.catLength',
    units: [
      { key: 'mm', label: 'mm', toBase: (v) => v, fromBase: (v) => v },
      { key: 'cm', label: 'cm', toBase: (v) => v * 10, fromBase: (v) => v / 10 },
      { key: 'm', label: 'm', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { key: 'in', label: 'in', toBase: (v) => v * 25.4, fromBase: (v) => v / 25.4 },
      { key: 'ft', label: 'ft', toBase: (v) => v * 304.8, fromBase: (v) => v / 304.8 },
      { key: 'yd', label: 'yd', toBase: (v) => v * 914.4, fromBase: (v) => v / 914.4 },
    ],
  },
  pressure: {
    labelKey: 'tools.unitConv.catPressure',
    units: [
      { key: 'Pa', label: 'Pa', toBase: (v) => v, fromBase: (v) => v },
      { key: 'kPa', label: 'kPa', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { key: 'MPa', label: 'MPa', toBase: (v) => v * 1000000, fromBase: (v) => v / 1000000 },
      { key: 'bar', label: 'bar', toBase: (v) => v * 100000, fromBase: (v) => v / 100000 },
      { key: 'psi', label: 'psi', toBase: (v) => v * 6894.757, fromBase: (v) => v / 6894.757 },
      { key: 'atm', label: 'atm', toBase: (v) => v * 101325, fromBase: (v) => v / 101325 },
      {
        key: 'kgf/cm2',
        label: 'kgf/cm²',
        toBase: (v) => v * 98066.5,
        fromBase: (v) => v / 98066.5,
      },
    ],
  },
  temperature: {
    labelKey: 'tools.unitConv.catTemperature',
    units: [
      { key: 'C', label: '°C', toBase: (v) => v, fromBase: (v) => v },
      {
        key: 'F',
        label: '°F',
        toBase: (v) => ((v - 32) * 5) / 9,
        fromBase: (v) => (v * 9) / 5 + 32,
      },
      { key: 'K', label: 'K', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  weight: {
    labelKey: 'tools.unitConv.catWeight',
    units: [
      { key: 'kg', label: 'kg', toBase: (v) => v, fromBase: (v) => v },
      { key: 'g', label: 'g', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
      { key: 'lb', label: 'lb', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
      { key: 'oz', label: 'oz', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
      {
        key: 'ton_m',
        label: 'ton (metric)',
        toBase: (v) => v * 1000,
        fromBase: (v) => v / 1000,
      },
      {
        key: 'ton_us',
        label: 'ton (short/US)',
        toBase: (v) => v * 907.185,
        fromBase: (v) => v / 907.185,
      },
      {
        key: 'ton_uk',
        label: 'ton (long/UK)',
        toBase: (v) => v * 1016.047,
        fromBase: (v) => v / 1016.047,
      },
    ],
  },
  volume: {
    labelKey: 'tools.unitConv.catVolume',
    units: [
      { key: 'l', label: 'L', toBase: (v) => v, fromBase: (v) => v },
      { key: 'ml', label: 'mL', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
      { key: 'm3', label: 'm³', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      {
        key: 'gal_us',
        label: 'gal (US)',
        toBase: (v) => v * 3.78541,
        fromBase: (v) => v / 3.78541,
      },
      {
        key: 'gal_uk',
        label: 'gal (UK)',
        toBase: (v) => v * 4.54609,
        fromBase: (v) => v / 4.54609,
      },
      { key: 'ft3', label: 'ft³', toBase: (v) => v * 28.3168, fromBase: (v) => v / 28.3168 },
      { key: 'bbl', label: 'bbl', toBase: (v) => v * 158.987, fromBase: (v) => v / 158.987 },
    ],
  },
  area: {
    labelKey: 'tools.unitConv.catArea',
    units: [
      { key: 'mm2', label: 'mm²', toBase: (v) => v, fromBase: (v) => v },
      { key: 'cm2', label: 'cm²', toBase: (v) => v * 100, fromBase: (v) => v / 100 },
      { key: 'm2', label: 'm²', toBase: (v) => v * 1000000, fromBase: (v) => v / 1000000 },
      { key: 'in2', label: 'in²', toBase: (v) => v * 645.16, fromBase: (v) => v / 645.16 },
      {
        key: 'ft2',
        label: 'ft²',
        toBase: (v) => v * 92903.04,
        fromBase: (v) => v / 92903.04,
      },
    ],
  },
  flowRate: {
    labelKey: 'tools.unitConv.catFlowRate',
    units: [
      { key: 'm3h', label: 'm³/h', toBase: (v) => v, fromBase: (v) => v },
      { key: 'lmin', label: 'L/min', toBase: (v) => v * 0.06, fromBase: (v) => v / 0.06 },
      {
        key: 'gpm',
        label: 'GPM (US)',
        toBase: (v) => v * 0.227125,
        fromBase: (v) => v / 0.227125,
      },
      { key: 'cfm', label: 'CFM', toBase: (v) => v * 1.69901, fromBase: (v) => v / 1.69901 },
    ],
  },
};

// NPS to DN lookup table
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
  { nps: '3-1/2"', dn: 90, od_mm: 101.6 },
  { nps: '4"', dn: 100, od_mm: 114.3 },
  { nps: '5"', dn: 125, od_mm: 141.3 },
  { nps: '6"', dn: 150, od_mm: 168.3 },
  { nps: '8"', dn: 200, od_mm: 219.1 },
  { nps: '10"', dn: 250, od_mm: 273.0 },
  { nps: '12"', dn: 300, od_mm: 323.8 },
  { nps: '14"', dn: 350, od_mm: 355.6 },
  { nps: '16"', dn: 400, od_mm: 406.4 },
  { nps: '18"', dn: 450, od_mm: 457.2 },
  { nps: '20"', dn: 500, od_mm: 508.0 },
  { nps: '22"', dn: 550, od_mm: 558.8 },
  { nps: '24"', dn: 600, od_mm: 609.6 },
  { nps: '26"', dn: 650, od_mm: 660.4 },
  { nps: '28"', dn: 700, od_mm: 711.2 },
  { nps: '30"', dn: 750, od_mm: 762.0 },
  { nps: '32"', dn: 800, od_mm: 812.8 },
  { nps: '34"', dn: 850, od_mm: 863.6 },
  { nps: '36"', dn: 900, od_mm: 914.4 },
  { nps: '42"', dn: 1050, od_mm: 1066.8 },
  { nps: '48"', dn: 1200, od_mm: 1219.2 },
];

function formatNumber(n: number): string {
  if (Math.abs(n) < 0.000001) return '0';
  if (Math.abs(n) >= 1000000) return n.toExponential(4);
  if (Math.abs(n) < 0.01) return n.toExponential(4);
  return n.toFixed(6).replace(/\.?0+$/, '');
}

export default function UnitConverterTool() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [category, setCategory] = useState<UnitCategory>('length');
  const [value, setValue] = useState('1');
  const [fromUnit, setFromUnit] = useState('mm');
  const [toUnit, setToUnit] = useState('in');
  const [npsSearch, setNpsSearch] = useState('');

  // Debounced usage logging (5s)
  const lastLogRef = useRef<number>(0);
  const logUsage = useCallback(
    (cat: string, val: number, from: string, to: string, res: number) => {
      if (!user) return;
      const now = Date.now();
      if (now - lastLogRef.current < 5000) return;
      lastLogRef.current = now;
      supabase
        .from(TABLES.toolUsage)
        .insert({
          user_id: user.id,
          tool_name: 'Unit Converter',
          tool_category: 'Utility',
          input_data: { category: cat, value: val, fromUnit: from, toUnit: to },
          output_data: { result: res },
        })
        .then(() => {});
    },
    [user]
  );

  const isNpsDn = category === 'npsDn';
  const catDef = isNpsDn ? null : CATEGORIES[category];

  const result = useMemo(() => {
    if (isNpsDn || !catDef) return null;
    const v = Number(value);
    if (isNaN(v) || value.trim() === '') return null;
    const from = catDef.units.find((u) => u.key === fromUnit);
    const to = catDef.units.find((u) => u.key === toUnit);
    if (!from || !to) return null;
    const base = from.toBase(v);
    const converted = to.fromBase(base);
    logUsage(category, v, fromUnit, toUnit, converted);
    return converted;
  }, [value, fromUnit, toUnit, catDef, isNpsDn, category, logUsage]);

  const allConversions = useMemo(() => {
    if (isNpsDn || !catDef) return [];
    const v = Number(value);
    if (isNaN(v) || value.trim() === '') return [];
    const from = catDef.units.find((u) => u.key === fromUnit);
    if (!from) return [];
    const base = from.toBase(v);
    return catDef.units.map((u) => ({
      key: u.key,
      label: u.label,
      value: u.fromBase(base),
    }));
  }, [value, fromUnit, catDef, isNpsDn]);

  const filteredNpsTable = useMemo(() => {
    if (!npsSearch.trim()) return NPS_DN_TABLE;
    const q = npsSearch.toLowerCase().trim();
    return NPS_DN_TABLE.filter(
      (row) =>
        row.nps.toLowerCase().includes(q) ||
        row.dn.toString().includes(q) ||
        row.od_mm.toString().includes(q)
    );
  }, [npsSearch]);

  const handleSwap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  const handleCategoryChange = (cat: UnitCategory) => {
    setCategory(cat);
    if (cat === 'npsDn') return;
    const units = CATEGORIES[cat].units;
    setFromUnit(units[0].key);
    setToUnit(units.length > 1 ? units[1].key : units[0].key);
    setValue('1');
  };

  const categoryKeys: UnitCategory[] = [
    'length',
    'pressure',
    'temperature',
    'weight',
    'volume',
    'area',
    'flowRate',
    'npsDn',
  ];

  const getCategoryLabel = (cat: UnitCategory) => {
    if (cat === 'npsDn') return t('tools.unitConv.catNpsDn');
    return t(CATEGORIES[cat].labelKey);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.unitConv.name')}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.unitConv.subtitle')}
        </h3>
      </div>

      {/* Category selector */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-zinc-400">
          {t('tools.unitConv.selectCategory')}
        </Label>
        <Select value={category} onValueChange={(v) => handleCategoryChange(v as UnitCategory)}>
          <SelectTrigger className="mt-1.5 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryKeys.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {getCategoryLabel(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Conversion UI (non-NPS-DN) */}
      {!isNpsDn && catDef && (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr,auto,1fr] items-end">
            {/* From */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('tools.unitConv.from')}
              </Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type="number"
                placeholder={t('tools.unitConv.enterValue')}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] text-lg"
              />
              <Select value={fromUnit} onValueChange={setFromUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catDef.units.map((u) => (
                    <SelectItem key={u.key} value={u.key}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Swap */}
            <Button
              onClick={handleSwap}
              variant="outline"
              size="icon"
              className="border-zinc-800 !bg-transparent hover:!bg-zinc-900 self-center"
              title={t('tools.unitConv.swap')}
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            {/* To */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('tools.unitConv.to')}
              </Label>
              <div className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-lg text-[#f59e0b] font-mono min-h-[44px] flex items-center">
                {result !== null ? formatNumber(result) : '—'}
              </div>
              <Select value={toUnit} onValueChange={setToUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catDef.units.map((u) => (
                    <SelectItem key={u.key} value={u.key}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Result highlight */}
          {result !== null && (
            <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
              <span className="text-sm text-zinc-400">
                {value} {catDef.units.find((u) => u.key === fromUnit)?.label} =
              </span>
              <span className="ml-2 text-xl font-mono text-[#f59e0b] font-semibold">
                {formatNumber(result)} {catDef.units.find((u) => u.key === toUnit)?.label}
              </span>
            </div>
          )}

          {/* Full conversion table */}
          {allConversions.length > 0 && (
            <div className="border border-zinc-800/80 bg-zinc-950 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
                {t('tools.unitConv.allConversions')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allConversions.map((c) => (
                  <div
                    key={c.key}
                    className={`flex justify-between items-center px-3 py-2 border rounded ${
                      c.key === toUnit
                        ? 'border-[#f59e0b]/50 bg-[#f59e0b]/5'
                        : 'border-zinc-800/50 hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="text-xs text-zinc-400">{c.label}</span>
                    <span className="text-sm font-mono text-zinc-100">
                      {formatNumber(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* NPS-DN Table */}
      {isNpsDn && (
        <div className="border border-zinc-800/80 bg-zinc-950 p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {t('tools.unitConv.npsDnTitle')}
          </p>
          <Input
            value={npsSearch}
            onChange={(e) => setNpsSearch(e.target.value)}
            placeholder={t('tools.unitConv.searchBySize')}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] max-w-sm"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900">
                  <th className="py-2 px-3 text-left text-xs uppercase text-zinc-400">
                    {t('tools.unitConv.nps')}
                  </th>
                  <th className="py-2 px-3 text-left text-xs uppercase text-zinc-400">
                    {t('tools.unitConv.dn')}
                  </th>
                  <th className="py-2 px-3 text-left text-xs uppercase text-zinc-400">
                    {t('tools.unitConv.od')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredNpsTable.map((row) => (
                  <tr
                    key={row.nps}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/50"
                  >
                    <td className="py-2 px-3 text-[#f59e0b] font-medium">{row.nps}</td>
                    <td className="py-2 px-3 text-zinc-300">DN{row.dn}</td>
                    <td className="py-2 px-3 text-zinc-300 font-mono">
                      {row.od_mm.toFixed(1)}
                    </td>
                  </tr>
                ))}
                {filteredNpsTable.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-zinc-500 text-sm">
                      No results
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
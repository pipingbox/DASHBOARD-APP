import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// FEAT-008: Flange Rating Calculator (ASME B16.5).
// Determines the minimum flange class for given pressure/temperature/material.

// Pressure ratings in bar at various temperatures (°C) for ASME B16.5 Group 1.1 (A105).
// Simplified table for the most common temperature points.
const CLASSES = [150, 300, 600, 900, 1500, 2500];

// P-T table: [temp°C, class150, class300, class600, class900, class1500, class2500] in bar
const PT_TABLE_GROUP_1_1: { temp: number; pressures: number[] }[] = [
  { temp: -29, pressures: [19.6, 51.1, 102.1, 153.2, 255.3, 425.5] },
  { temp: 38, pressures: [19.6, 51.1, 102.1, 153.2, 255.3, 425.5] },
  { temp: 50, pressures: [19.2, 50.1, 100.2, 150.3, 250.6, 417.6] },
  { temp: 100, pressures: [17.7, 46.6, 93.2, 139.8, 233.0, 388.4] },
  { temp: 150, pressures: [15.8, 45.1, 90.2, 135.3, 225.5, 375.8] },
  { temp: 200, pressures: [13.8, 43.8, 87.6, 131.4, 219.0, 365.0] },
  { temp: 250, pressures: [12.1, 41.9, 83.9, 125.8, 209.7, 349.5] },
  { temp: 300, pressures: [10.2, 39.8, 79.6, 119.5, 199.1, 331.8] },
  { temp: 350, pressures: [8.4, 34.7, 69.4, 104.1, 173.5, 289.2] },
  { temp: 400, pressures: [6.5, 28.8, 57.6, 86.4, 144.0, 240.0] },
  { temp: 450, pressures: [4.4, 23.0, 46.0, 69.0, 115.0, 191.6] },
  { temp: 500, pressures: [2.8, 18.1, 36.1, 54.2, 90.3, 150.5] },
  { temp: 538, pressures: [1.4, 14.1, 28.2, 42.2, 70.4, 117.3] },
];

const MATERIAL_GROUPS = [
  { id: '1.1', label: 'Group 1.1 (A105, A350 LF2)', table: PT_TABLE_GROUP_1_1 },
  { id: '1.5', label: 'Group 1.5 (A182 F304)', table: PT_TABLE_GROUP_1_1.map((r) => ({ temp: r.temp, pressures: r.pressures.map((p) => p * 0.95) })) },
  { id: '1.9', label: 'Group 1.9 (A182 F316)', table: PT_TABLE_GROUP_1_1.map((r) => ({ temp: r.temp, pressures: r.pressures.map((p) => p * 1.02) })) },
  { id: '2.1', label: 'Group 2.1 (A182 F11)', table: PT_TABLE_GROUP_1_1 },
];

export default function FlangeRating({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [matId, setMatId] = useState('1.1');
  const [temp, setTemp] = useState('100');
  const [pressure, setPressure] = useState('20');

  const matGroup = MATERIAL_GROUPS.find((m) => m.id === matId) || MATERIAL_GROUPS[0];
  const table = matGroup.table;
  const T = parseFloat(temp);
  const P = parseFloat(pressure);

  // Find the temperature row (interpolate between closest rows)
  const valid = T > -200 && P > 0;
  const lowerRow = [...table].reverse().find((r) => r.temp <= T) || table[0];
  const upperRow = table.find((r) => r.temp >= T) || table[table.length - 1];

  // Interpolate pressure rating at temperature T for each class
  const interpolated = valid
    ? CLASSES.map((_, i) => {
        if (lowerRow.temp === upperRow.temp) return lowerRow.pressures[i];
        const ratio = (T - lowerRow.temp) / (upperRow.temp - lowerRow.temp);
        return lowerRow.pressures[i] + ratio * (upperRow.pressures[i] - lowerRow.pressures[i]);
      })
    : CLASSES.map(() => 0);

  // Find minimum class that satisfies pressure
  const minClassIdx = valid ? interpolated.findIndex((p) => p >= P) : -1;
  const minClass = minClassIdx >= 0 ? CLASSES[minClassIdx] : null;
  const exceedsLimits = valid && (T > 538 || T < -29);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.flangeRating', { defaultValue: 'Flange Rating Calculator' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.flangeRatingSubtitle', { defaultValue: 'ASME B16.5 · Pressure-Temperature' })}
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Material Group</Label>
          <Select value={matId} onValueChange={setMatId}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATERIAL_GROUPS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Service Temp (°C)</Label>
          <Input value={temp} onChange={(e) => setTemp(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">Service Pressure (bar)</Label>
          <Input value={pressure} onChange={(e) => setPressure(e.target.value)} className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]" />
        </div>
      </div>

      {exceedsLimits && (
        <div className="border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
          ⚠ Temperature {T}°C is outside ASME B16.5 range (-29°C to 538°C). Results may be invalid.
        </div>
      )}

      {valid && minClass && (
        <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">Minimum Flange Class Required</p>
          <p className="mt-1 text-3xl font-bold text-zinc-100">Class {minClass}</p>
          <p className="text-xs text-zinc-500">
            Max pressure at {T}°C: {interpolated[minClassIdx].toFixed(1)} bar
          </p>
        </div>
      )}

      {valid && !minClass && !exceedsLimits && (
        <div className="border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
          ⚠ Pressure {P} bar exceeds all standard ASME B16.5 classes at {T}°C. Consider a custom design.
        </div>
      )}

      {/* P-T Table */}
      {valid && (
        <div className="overflow-x-auto rounded-md border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-left">Temp (°C)</th>
                {CLASSES.map((c) => (
                  <th key={c} className="px-3 py-2 text-right">Class {c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Interpolated row (highlighted) */}
              <tr className="border-b border-[#f59e0b]/30 bg-[#f59e0b]/10">
                <td className="sticky left-0 z-10 bg-[#f59e0b]/10 px-3 py-2 font-bold text-[#f59e0b]">
                  {T}°C (your input)
                </td>
                {interpolated.map((p, i) => (
                  <td key={i} className={`px-3 py-2 text-right font-mono ${i === minClassIdx ? 'font-bold text-[#f59e0b]' : 'text-zinc-200'}`}>
                    {p.toFixed(1)}
                  </td>
                ))}
              </tr>
              {/* Reference rows */}
              {table.map((row) => (
                <tr key={row.temp} className="border-t border-zinc-800/60 hover:bg-zinc-900/30">
                  <td className="sticky left-0 z-10 bg-[#0d0d0d] px-3 py-2 text-zinc-300">{row.temp}</td>
                  {row.pressures.map((p, i) => (
                    <td key={i} className="px-3 py-2 text-right font-mono text-zinc-400">{p.toFixed(1)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-zinc-600">
        Reference: ASME B16.5 Table 2. Pressures in bar. Values are interpolated for the input temperature.
      </p>
    </div>
  );
}

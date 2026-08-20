import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

// QW-002: Pipe Data Tables. Reference data that every piping professional
// consults daily. Data from ASME B36.10M (pipe), B16.5 (flanges), PCC-1 (bolting).

interface PipeDim {
  nps: string;
  dn: number;
  od: number; // mm
  wall10: number | null;
  wall40: number | null;
  wall80: number | null;
  wall160: number | null;
  wallXXS: number | null;
  weight40: number | null; // kg/m
}

const PIPE_DIMENSIONS: PipeDim[] = [
  { nps: '1/8"', dn: 6, od: 10.3, wall10: 1.24, wall40: 1.73, wall80: 2.41, wall160: null, wallXXS: null, weight40: 0.37 },
  { nps: '1/4"', dn: 8, od: 13.7, wall10: 1.65, wall40: 2.24, wall80: 3.02, wall160: null, wallXXS: null, weight40: 0.63 },
  { nps: '3/8"', dn: 10, od: 17.1, wall10: 1.65, wall40: 2.31, wall80: 3.20, wall160: null, wallXXS: null, weight40: 0.84 },
  { nps: '1/2"', dn: 15, od: 21.3, wall10: 1.65, wall40: 2.77, wall80: 3.73, wall160: 4.78, wallXXS: 7.47, weight40: 1.27 },
  { nps: '3/4"', dn: 20, od: 26.7, wall10: 1.65, wall40: 2.87, wall80: 3.91, wall160: 5.54, wallXXS: 7.82, weight40: 1.68 },
  { nps: '1"', dn: 25, od: 33.4, wall10: 1.65, wall40: 3.38, wall80: 4.55, wall160: 6.35, wallXXS: 9.09, weight40: 2.50 },
  { nps: '1-1/4"', dn: 32, od: 42.2, wall10: 1.65, wall40: 3.56, wall80: 4.85, wall160: 6.35, wallXXS: 9.70, weight40: 3.39 },
  { nps: '1-1/2"', dn: 40, od: 48.3, wall10: 1.65, wall40: 3.68, wall80: 5.08, wall160: 7.14, wallXXS: 10.16, weight40: 3.97 },
  { nps: '2"', dn: 50, od: 60.3, wall10: 1.65, wall40: 3.91, wall80: 5.54, wall160: 8.74, wallXXS: 11.07, weight40: 5.44 },
  { nps: '2-1/2"', dn: 65, od: 73.0, wall10: 2.11, wall40: 5.16, wall80: 7.01, wall160: 9.53, wallXXS: 14.02, weight40: 8.63 },
  { nps: '3"', dn: 80, od: 88.9, wall10: 2.11, wall40: 5.49, wall80: 7.62, wall160: 11.13, wallXXS: 15.24, weight40: 11.29 },
  { nps: '4"', dn: 100, od: 114.3, wall10: 2.11, wall40: 6.02, wall80: 8.56, wall160: 13.49, wallXXS: 17.12, weight40: 16.07 },
  { nps: '5"', dn: 125, od: 141.3, wall10: 2.77, wall40: 6.55, wall80: 9.53, wall160: 15.88, wallXXS: 19.05, weight40: 21.77 },
  { nps: '6"', dn: 150, od: 168.3, wall10: 2.77, wall40: 7.11, wall80: 10.97, wall160: 18.26, wallXXS: 21.95, weight40: 28.26 },
  { nps: '8"', dn: 200, od: 219.1, wall10: 2.79, wall40: 8.18, wall80: 12.70, wall160: 23.01, wallXXS: 22.23, weight40: 42.55 },
  { nps: '10"', dn: 250, od: 273.0, wall10: 3.40, wall40: 9.27, wall80: 15.09, wall160: 28.58, wallXXS: 25.40, weight40: 60.32 },
  { nps: '12"', dn: 300, od: 323.8, wall10: 3.96, wall40: 10.31, wall80: 17.48, wall160: 33.32, wallXXS: 25.40, weight40: 79.73 },
  { nps: '14"', dn: 350, od: 355.6, wall10: 3.96, wall40: 11.13, wall80: 19.05, wall160: 35.71, wallXXS: null, weight40: 94.55 },
  { nps: '16"', dn: 400, od: 406.4, wall10: 4.19, wall40: 12.70, wall80: 21.44, wall160: 40.49, wallXXS: null, weight40: 123.31 },
  { nps: '18"', dn: 450, od: 457.0, wall10: 4.19, wall40: 14.27, wall80: 23.83, wall160: 45.24, wallXXS: null, weight40: 155.15 },
  { nps: '20"', dn: 500, od: 508.0, wall10: 4.78, wall40: 15.09, wall80: 26.19, wall160: 50.01, wallXXS: null, weight40: 183.74 },
  { nps: '24"', dn: 600, od: 609.6, wall10: 5.54, wall40: 17.48, wall80: 30.96, wall160: 59.54, wallXXS: null, weight40: 254.49 },
];

interface FlangeDim {
  nps: string;
  od: number;
  thickness: number;
  boltCircle: number;
  numBolts: number;
  boltDia: number;
}

const FLANGE_150: FlangeDim[] = [
  { nps: '1/2"', od: 88.9, thickness: 11.2, boltCircle: 60.3, numBolts: 4, boltDia: 12.7 },
  { nps: '3/4"', od: 98.6, thickness: 11.2, boltCircle: 69.9, numBolts: 4, boltDia: 12.7 },
  { nps: '1"', od: 108.0, thickness: 11.2, boltCircle: 79.4, numBolts: 4, boltDia: 12.7 },
  { nps: '1-1/4"', od: 117.5, thickness: 11.2, boltCircle: 88.9, numBolts: 4, boltDia: 12.7 },
  { nps: '1-1/2"', od: 127.0, thickness: 14.3, boltCircle: 98.6, numBolts: 4, boltDia: 12.7 },
  { nps: '2"', od: 152.4, thickness: 14.3, boltCircle: 120.7, numBolts: 4, boltDia: 15.9 },
  { nps: '2-1/2"', od: 177.8, thickness: 15.9, boltCircle: 139.7, numBolts: 4, boltDia: 15.9 },
  { nps: '3"', od: 190.5, thickness: 17.5, boltCircle: 152.4, numBolts: 4, boltDia: 15.9 },
  { nps: '4"', od: 228.6, thickness: 19.1, boltCircle: 190.5, numBolts: 8, boltDia: 15.9 },
  { nps: '5"', od: 254.0, thickness: 20.7, boltCircle: 215.9, numBolts: 8, boltDia: 15.9 },
  { nps: '6"', od: 279.4, thickness: 22.3, boltCircle: 241.3, numBolts: 8, boltDia: 19.1 },
  { nps: '8"', od: 342.9, thickness: 23.9, boltCircle: 298.5, numBolts: 8, boltDia: 19.1 },
  { nps: '10"', od: 406.4, thickness: 25.4, boltCircle: 362.0, numBolts: 12, boltDia: 19.1 },
  { nps: '12"', od: 482.6, thickness: 27.0, boltCircle: 431.8, numBolts: 12, boltDia: 22.2 },
  { nps: '14"', od: 533.4, thickness: 28.6, boltCircle: 476.3, numBolts: 12, boltDia: 22.2 },
  { nps: '16"', od: 597.9, thickness: 30.2, boltCircle: 539.8, numBolts: 16, boltDia: 22.2 },
  { nps: '18"', od: 635.0, thickness: 31.8, boltCircle: 577.9, numBolts: 16, boltDia: 25.4 },
  { nps: '20"', od: 698.5, thickness: 33.3, boltCircle: 635.0, numBolts: 20, boltDia: 25.4 },
  { nps: '24"', od: 813.0, thickness: 35.0, boltCircle: 749.3, numBolts: 20, boltDia: 28.6 },
];

interface BoltTorque {
  size: string;
  grade: string;
  torqueLubed: number;
  torqueDry: number;
}

const BOLT_TORQUE: BoltTorque[] = [
  { size: '1/2"', grade: 'B7', torqueLubed: 68, torqueDry: 102 },
  { size: '5/8"', grade: 'B7', torqueLubed: 137, torqueDry: 205 },
  { size: '3/4"', grade: 'B7', torqueLubed: 244, torqueDry: 366 },
  { size: '7/8"', grade: 'B7', torqueLubed: 393, torqueDry: 590 },
  { size: '1"', grade: 'B7', torqueLubed: 597, torqueDry: 895 },
  { size: '1-1/8"', grade: 'B7', torqueLubed: 868, torqueDry: 1302 },
  { size: '1-1/4"', grade: 'B7', torqueLubed: 1216, torqueDry: 1824 },
  { size: '1-1/2"', grade: 'B7', torqueLubed: 2034, torqueDry: 3051 },
  { size: '1/2"', grade: 'B8', torqueLubed: 34, torqueDry: 51 },
  { size: '5/8"', grade: 'B8', torqueLubed: 68, torqueDry: 102 },
  { size: '3/4"', grade: 'B8', torqueLubed: 122, torqueDry: 183 },
  { size: '7/8"', grade: 'B8', torqueLubed: 197, torqueDry: 295 },
  { size: '1"', grade: 'B8', torqueLubed: 298, torqueDry: 447 },
  { size: '1-1/8"', grade: 'B8', torqueLubed: 434, torqueDry: 651 },
  { size: '1-1/4"', grade: 'B8', torqueLubed: 608, torqueDry: 912 },
  { size: '1-1/2"', grade: 'B8', torqueLubed: 1017, torqueDry: 1525 },
];

function mmToIn(mm: number): string {
  return (mm / 25.4).toFixed(3);
}

export default function PipeDataTables({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');

  const filteredPipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PIPE_DIMENSIONS;
    return PIPE_DIMENSIONS.filter(
      (p) => p.nps.toLowerCase().includes(q) || String(p.dn).includes(q) || String(p.od).includes(q),
    );
  }, [search]);

  const filteredFlanges = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FLANGE_150;
    return FLANGE_150.filter((f) => f.nps.toLowerCase().includes(q));
  }, [search]);

  const filteredBolts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return BOLT_TORQUE;
    return BOLT_TORQUE.filter((b) => b.size.toLowerCase().includes(q) || b.grade.toLowerCase().includes(q));
  }, [search]);

  const fmt = (v: number | null) => {
    if (v === null) return '—';
    return unit === 'mm' ? v.toFixed(2) : (v / 25.4).toFixed(3);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.pipeDataTables', { defaultValue: 'Pipe Data Tables' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.pipeDataTablesSubtitle', { defaultValue: 'ASME B36.10M · B16.5 · PCC-1' })}
        </h3>
      </div>

      {/* Search + Unit toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tools.searchNps', { defaultValue: 'Search by NPS, DN, or OD…' })}
            className="bg-zinc-950 border-zinc-800 pl-9 focus-visible:ring-[#f59e0b]"
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={unit === 'mm' ? 'default' : 'outline'}
            onClick={() => setUnit('mm')}
            className={unit === 'mm' ? 'bg-[#f59e0b] text-black' : 'border-zinc-800'}
          >
            mm
          </Button>
          <Button
            size="sm"
            variant={unit === 'in' ? 'default' : 'outline'}
            onClick={() => setUnit('in')}
            className={unit === 'in' ? 'bg-[#f59e0b] text-black' : 'border-zinc-800'}
          >
            in
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pipe">
        <TabsList className="bg-zinc-950 border border-zinc-800">
          <TabsTrigger value="pipe">{t('tools.tabPipe', { defaultValue: 'Pipe (B36.10M)' })}</TabsTrigger>
          <TabsTrigger value="flange">{t('tools.tabFlange', { defaultValue: 'Flange (B16.5)' })}</TabsTrigger>
          <TabsTrigger value="bolt">{t('tools.tabBolt', { defaultValue: 'Bolt Torque (PCC-1)' })}</TabsTrigger>
        </TabsList>

        {/* Pipe Dimensions */}
        <TabsContent value="pipe">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-left">NPS</th>
                  <th className="px-3 py-2 text-right">DN</th>
                  <th className="px-3 py-2 text-right">OD</th>
                  <th className="px-3 py-2 text-right">Sch 10</th>
                  <th className="px-3 py-2 text-right">Sch 40</th>
                  <th className="px-3 py-2 text-right">Sch 80</th>
                  <th className="px-3 py-2 text-right">Sch 160</th>
                  <th className="px-3 py-2 text-right">XXS</th>
                  <th className="px-3 py-2 text-right">Wt (kg/m)</th>
                </tr>
              </thead>
              <tbody>
                {filteredPipes.map((p) => (
                  <tr key={p.nps} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="sticky left-0 z-10 bg-[#0d0d0d] px-3 py-2 font-semibold text-zinc-100">{p.nps}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">{p.dn}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-100">{fmt(p.od)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmt(p.wall10)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{fmt(p.wall40)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{fmt(p.wall80)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmt(p.wall160)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmt(p.wallXXS)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">{p.weight40 ?? '—'}</td>
                  </tr>
                ))}
                {filteredPipes.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-zinc-500">No matching sizes</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Reference: ASME B36.10M. Weight for Schedule 40.</p>
        </TabsContent>

        {/* Flange Dimensions */}
        <TabsContent value="flange">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-left">NPS</th>
                  <th className="px-3 py-2 text-right">OD</th>
                  <th className="px-3 py-2 text-right">Thickness</th>
                  <th className="px-3 py-2 text-right">Bolt Circle</th>
                  <th className="px-3 py-2 text-right">Bolts</th>
                  <th className="px-3 py-2 text-right">Bolt Dia</th>
                </tr>
              </thead>
              <tbody>
                {filteredFlanges.map((f) => (
                  <tr key={f.nps} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="sticky left-0 z-10 bg-[#0d0d0d] px-3 py-2 font-semibold text-zinc-100">{f.nps}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-100">{fmt(f.od)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{fmt(f.thickness)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{fmt(f.boltCircle)}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">{f.numBolts}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{fmt(f.boltDia)}</td>
                  </tr>
                ))}
                {filteredFlanges.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">No matching sizes</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Reference: ASME B16.5 Class 150. Bolt dia in {unit}.</p>
        </TabsContent>

        {/* Bolt Torque */}
        <TabsContent value="bolt">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-left">Bolt Size</th>
                  <th className="px-3 py-2 text-left">Grade</th>
                  <th className="px-3 py-2 text-right">Torque Lubed (Nm)</th>
                  <th className="px-3 py-2 text-right">Torque Dry (Nm)</th>
                </tr>
              </thead>
              <tbody>
                {filteredBolts.map((b, i) => (
                  <tr key={`${b.size}-${b.grade}-${i}`} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="sticky left-0 z-10 bg-[#0d0d0d] px-3 py-2 font-semibold text-zinc-100">{b.size}</td>
                    <td className="px-3 py-2 text-zinc-300">{b.grade}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{b.torqueLubed}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-200">{b.torqueDry}</td>
                  </tr>
                ))}
                {filteredBolts.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No matching bolts</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Reference: ASME PCC-1. Torque values in Nm.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

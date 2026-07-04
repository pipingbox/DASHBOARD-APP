import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// FEAT-003: Fitting Take-Off (Make-Up) tables.
// Center-to-End dimensions per ASME B16.9 for elbows, tees, reducers.

interface FittingRow {
  nps: string;
  dn: number;
  // Elbows (center-to-end A in mm)
  elbow90LR: number;
  elbow90SR: number;
  elbow45LR: number;
  // Tees (run C, outlet M in mm)
  teeRun: number;
  teeOutlet: number;
  // Reducer (length H in mm)
  reducerLen: number;
}

// ASME B16.9 dimensions (mm) — Long Radius (LR) = 1.5D, Short Radius (SR) = 1.0D
const FITTING_DATA: FittingRow[] = [
  { nps: '1/2"', dn: 15, elbow90LR: 38, elbow90SR: 25, elbow45LR: 16, teeRun: 38, teeOutlet: 25, reducerLen: 38 },
  { nps: '3/4"', dn: 20, elbow90LR: 44, elbow90SR: 29, elbow45LR: 19, teeRun: 44, teeOutlet: 29, reducerLen: 44 },
  { nps: '1"', dn: 25, elbow90LR: 51, elbow90SR: 32, elbow45LR: 22, teeRun: 51, teeOutlet: 32, reducerLen: 51 },
  { nps: '1-1/4"', dn: 32, elbow90LR: 64, elbow90SR: 41, elbow45LR: 27, teeRun: 64, teeOutlet: 41, reducerLen: 64 },
  { nps: '1-1/2"', dn: 40, elbow90LR: 76, elbow90SR: 48, elbow45LR: 32, teeRun: 76, teeOutlet: 48, reducerLen: 64 },
  { nps: '2"', dn: 50, elbow90LR: 102, elbow90SR: 64, elbow45LR: 43, teeRun: 102, teeOutlet: 64, reducerLen: 76 },
  { nps: '2-1/2"', dn: 65, elbow90LR: 127, elbow90SR: 83, elbow45LR: 52, teeRun: 127, teeOutlet: 83, reducerLen: 89 },
  { nps: '3"', dn: 80, elbow90LR: 152, elbow90SR: 97, elbow45LR: 64, teeRun: 152, teeOutlet: 97, reducerLen: 89 },
  { nps: '4"', dn: 100, elbow90LR: 203, elbow90SR: 130, elbow45LR: 86, teeRun: 203, teeOutlet: 130, reducerLen: 102 },
  { nps: '5"', dn: 125, elbow90LR: 254, elbow90SR: 162, elbow45LR: 108, teeRun: 254, teeOutlet: 162, reducerLen: 127 },
  { nps: '6"', dn: 150, elbow90LR: 305, elbow90SR: 194, elbow45LR: 130, teeRun: 305, teeOutlet: 194, reducerLen: 140 },
  { nps: '8"', dn: 200, elbow90LR: 406, elbow90SR: 260, elbow45LR: 173, teeRun: 406, teeOutlet: 260, reducerLen: 152 },
  { nps: '10"', dn: 250, elbow90LR: 508, elbow90SR: 324, elbow45LR: 216, teeRun: 508, teeOutlet: 324, reducerLen: 178 },
  { nps: '12"', dn: 300, elbow90LR: 610, elbow90SR: 387, elbow45LR: 254, teeRun: 610, teeOutlet: 387, reducerLen: 203 },
  { nps: '14"', dn: 350, elbow90LR: 711, elbow90SR: 454, elbow45LR: 295, teeRun: 711, teeOutlet: 454, reducerLen: 216 },
  { nps: '16"', dn: 400, elbow90LR: 813, elbow90SR: 518, elbow45LR: 337, teeRun: 813, teeOutlet: 518, reducerLen: 229 },
  { nps: '18"', dn: 450, elbow90LR: 914, elbow90SR: 582, elbow45LR: 378, teeRun: 914, teeOutlet: 582, reducerLen: 241 },
  { nps: '20"', dn: 500, elbow90LR: 1016, elbow90SR: 646, elbow45LR: 419, teeRun: 1016, teeOutlet: 646, reducerLen: 254 },
  { nps: '24"', dn: 600, elbow90LR: 1219, elbow90SR: 774, elbow45LR: 502, teeRun: 1219, teeOutlet: 774, reducerLen: 279 },
];

export default function FittingTakeOff({ user: _user }: { user?: { id: string } | null }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');

  const filtered = search.trim()
    ? FITTING_DATA.filter(
        (f) => f.nps.toLowerCase().includes(search.toLowerCase()) || String(f.dn).includes(search),
      )
    : FITTING_DATA;

  const fmt = (mm: number) => (unit === 'mm' ? mm.toFixed(0) : (mm / 25.4).toFixed(2));

  const Th = ({ children }: { children: React.ReactNode }) => (
    <th className="sticky top-0 bg-zinc-900 px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-400">
      {children}
    </th>
  );
  const Td = ({ children }: { children: React.ReactNode }) => (
    <td className="px-3 py-2 text-right font-mono text-zinc-200">{children}</td>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.fittingTakeOff', { defaultValue: 'Fitting Take-Off' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.fittingTakeOffSubtitle', { defaultValue: 'ASME B16.9 · Center-to-End Dimensions' })}
        </h3>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search NPS or DN…"
          className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
        />
        <button
          onClick={() => setUnit(unit === 'mm' ? 'in' : 'mm')}
          className="shrink-0 rounded-md border border-zinc-800 bg-zinc-950 px-4 text-sm font-semibold text-[#f59e0b]"
        >
          {unit}
        </button>
      </div>

      <Tabs defaultValue="elbow">
        <TabsList className="bg-zinc-950 border border-zinc-800">
          <TabsTrigger value="elbow">Elbows</TabsTrigger>
          <TabsTrigger value="tee">Tees</TabsTrigger>
          <TabsTrigger value="reducer">Reducers</TabsTrigger>
        </TabsList>

        <TabsContent value="elbow">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-zinc-900 px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-400">NPS</th>
                  <Th>DN</Th>
                  <Th>90° LR (A)</Th>
                  <Th>90° SR (A)</Th>
                  <Th>45° LR (A)</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.nps} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="sticky left-0 bg-[#0d0d0d] px-3 py-2 font-semibold text-zinc-100">{f.nps}</td>
                    <Td>{f.dn}</Td>
                    <Td>{fmt(f.elbow90LR)}</Td>
                    <Td>{fmt(f.elbow90SR)}</Td>
                    <Td>{fmt(f.elbow45LR)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">LR = Long Radius (1.5D) · SR = Short Radius (1.0D). A = Center-to-End.</p>
        </TabsContent>

        <TabsContent value="tee">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-zinc-900 px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-400">NPS</th>
                  <Th>DN</Th>
                  <Th>Run (C)</Th>
                  <Th>Outlet (M)</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.nps} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="sticky left-0 bg-[#0d0d0d] px-3 py-2 font-semibold text-zinc-100">{f.nps}</td>
                    <Td>{f.dn}</Td>
                    <Td>{fmt(f.teeRun)}</Td>
                    <Td>{fmt(f.teeOutlet)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Equal Tee. C = Run dimension. M = Outlet dimension.</p>
        </TabsContent>

        <TabsContent value="reducer">
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-zinc-900 px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-400">NPS</th>
                  <Th>DN</Th>
                  <Th>Length (H)</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.nps} className="border-t border-zinc-800/60 hover:bg-zinc-900/50">
                    <td className="sticky left-0 bg-[#0d0d0d] px-3 py-2 font-semibold text-zinc-100">{f.nps}</td>
                    <Td>{f.dn}</Td>
                    <Td>{fmt(f.reducerLen)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Concentric/Excentric Reducer. H = End-to-End length.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

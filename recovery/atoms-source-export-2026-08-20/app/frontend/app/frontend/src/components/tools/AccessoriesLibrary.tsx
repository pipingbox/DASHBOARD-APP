import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  FITTING_CATEGORIES,
  ELBOW_ENTRIES,
  ELBOW_COLUMNS,
  TEE_ENTRIES,
  TEE_COLUMNS,
  REDUCER_RAW,
  VALVE_RAW,
  VALVE_TYPES,
  VALVE_CLASSES,
  CAP_ENTRIES,
  CAP_COLUMNS,
  FLANGE_ENTRIES,
  FLANGE_TYPES,
  FLANGE_CLASSES,
  FLANGE_COLUMNS_WN,
  FLANGE_COLUMNS_SO,
  STUD_BOLT_ENTRIES,
  STUD_BOLT_CLASSES,
  STUD_BOLT_COLUMNS,
  GASKET_ENTRIES,
  GASKET_CLASSES,
  GASKET_COLUMNS,
  STUB_END_ENTRIES,
  STUB_END_COLUMNS,
  OLET_ENTRIES,
  OLET_TYPES,
  OLET_RAW,
  SW_FITTING_ENTRIES,
  SW_FITTING_TYPES,
  THREADED_FITTING_ENTRIES,
  THREADED_FITTING_TYPES,
  SPECTACLE_BLIND_ENTRIES,
  SPECTACLE_BLIND_CLASSES,
  SPECTACLE_BLIND_COLUMNS,
  Y_STRAINER_ENTRIES,
  Y_STRAINER_COLUMNS,
  mmToInch,
} from '@/lib/fittingsData';
import type { FittingCategory, FittingEntry } from '@/lib/fittingsData';

type View = 'grid' | 'detail';

const CATEGORY_ICONS: Record<string, string> = {
  'elbow-bw': '↰', 'tee-bw': '⊤', 'reducer-bw': '⊃', 'cap-bw': '⊓',
  valve: '⊞', flange: '⊚', 'stud-bolt': '⎅', gasket: '◎',
  'stub-end': '⊔', olet: '⊕', 'fitting-sw': '⊟', 'fitting-threaded': '⊡',
  'spectacle-blind': '◑', 'y-strainer': '⋔',
};

export default function AccessoriesLibrary() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('grid');
  const [activeCategory, setActiveCategory] = useState<FittingCategory | null>(null);
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');
  const [search, setSearch] = useState('');
  const [subType, setSubType] = useState<string>('');
  const [classRating, setClassRating] = useState<number>(150);

  const toUnit = (mm: number) => (unit === 'mm' ? mm : mmToInch(mm));
  const unitLabel = unit === 'mm' ? 'mm' : 'in';
  const filterNPS = (nps: string) => !search || nps.toLowerCase().includes(search.toLowerCase());

  const openCategory = (id: FittingCategory) => {
    setActiveCategory(id);
    setView('detail');
    setSearch('');
    // Set default sub-selectors per category
    if (id === 'valve') { setSubType('Gate'); setClassRating(150); }
    else if (id === 'flange') { setSubType('WN'); setClassRating(150); }
    else if (id === 'stud-bolt') { setSubType(''); setClassRating(150); }
    else if (id === 'gasket') { setSubType('SWG'); setClassRating(150); }
    else if (id === 'olet') { setSubType('Weldolet'); }
    else if (id === 'fitting-sw') { setSubType('Elbow 90°'); }
    else if (id === 'fitting-threaded') { setSubType('Elbow 90°'); }
    else if (id === 'spectacle-blind') { setClassRating(150); }
    else { setSubType(''); setClassRating(150); }
  };

  const goBack = () => { setView('grid'); setActiveCategory(null); setSearch(''); };

  // ─── Sub-selector configs ───
  type SelectorConfig = { types?: readonly string[]; classes?: readonly number[]; classFilterForType?: (type: string, cls: number) => boolean };
  const selectorConfig: Partial<Record<FittingCategory, SelectorConfig>> = {
    valve: { types: VALVE_TYPES, classes: VALVE_CLASSES, classFilterForType: (tp, c) => tp === 'Gate' || c <= 300 },
    flange: { types: FLANGE_TYPES, classes: FLANGE_CLASSES },
    'stud-bolt': { classes: STUD_BOLT_CLASSES },
    gasket: { classes: GASKET_CLASSES },
    olet: { types: OLET_TYPES },
    'fitting-sw': { types: SW_FITTING_TYPES },
    'fitting-threaded': { types: THREADED_FITTING_TYPES },
    'spectacle-blind': { classes: SPECTACLE_BLIND_CLASSES },
  };

  const cfg = activeCategory ? selectorConfig[activeCategory] : undefined;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {view === 'detail' && (
          <button onClick={goBack} className="flex items-center justify-center h-8 w-8 border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-[#f59e0b] hover:border-[#f59e0b] transition">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">{t('tools.accessories.title')}</p>
          <h3 className="mt-1 text-xl font-semibold">
            {view === 'grid' ? t('tools.accessories.subtitle') : t(FITTING_CATEGORIES.find((c) => c.id === activeCategory)?.nameKey ?? '')}
          </h3>
          {view === 'grid' && <p className="mt-1 text-sm text-zinc-400">{t('tools.accessories.desc')}</p>}
        </div>
      </div>

      {/* ─── GRID VIEW ─── */}
      {view === 'grid' && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {FITTING_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              disabled={!cat.available}
              onClick={() => cat.available && openCategory(cat.id)}
              className={`group relative border p-4 text-left transition ${
                cat.available ? 'border-zinc-800 bg-[#0d0d0d] hover:border-[#f59e0b] hover:bg-[#f59e0b]/5 cursor-pointer' : 'border-zinc-800/40 bg-zinc-950/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-2xl mb-2">{CATEGORY_ICONS[cat.id] ?? '⊙'}</div>
              <p className="text-sm font-medium text-zinc-200 group-hover:text-[#f59e0b] transition">{t(cat.nameKey)}</p>
              <p className="text-[10px] text-zinc-500 mt-1">{cat.standard}</p>
            </button>
          ))}
        </div>
      )}

      {/* ─── DETAIL VIEW ─── */}
      {view === 'detail' && activeCategory && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="NPS..." className="w-36 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] text-sm" />
            <ToggleGroup options={['mm', 'in']} value={unit} onChange={(v) => setUnit(v as 'mm' | 'in')} />
            {cfg?.types && <ToggleGroup options={cfg.types as unknown as string[]} value={subType} onChange={setSubType} />}
            {cfg?.classes && (
              <ToggleGroup
                options={(cfg.classFilterForType && subType ? cfg.classes.filter((c) => cfg.classFilterForType!(subType, c)) : cfg.classes).map(String)}
                value={String(classRating)}
                onChange={(v) => setClassRating(Number(v))}
              />
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-zinc-800/60">
            <CategoryTable category={activeCategory} subType={subType} classRating={classRating} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} t={t} />
          </div>
          <p className="text-[10px] text-zinc-600">{t('tools.accessories.reference')}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Toggle Group (reusable) ─── */
function ToggleGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex border border-zinc-800 divide-x divide-zinc-800">
      {options.map((opt) => (
        <button key={opt} onClick={() => onChange(opt)} className={`px-3 py-1.5 text-xs transition ${value === opt ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'bg-zinc-950 text-zinc-400'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ─── Category Table Router ─── */
interface CategoryTableProps {
  category: FittingCategory;
  subType: string;
  classRating: number;
  filterNPS: (nps: string) => boolean;
  toUnit: (mm: number) => number;
  unitLabel: string;
  t: (key: string) => string;
}

function CategoryTable({ category, subType, classRating, filterNPS, toUnit, unitLabel, t }: CategoryTableProps) {
  switch (category) {
    case 'elbow-bw':
      return <GenericTable entries={ELBOW_ENTRIES} columns={ELBOW_COLUMNS} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'tee-bw':
      return <GenericTable entries={TEE_ENTRIES} columns={TEE_COLUMNS} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'reducer-bw':
      return <ReducerTable data={REDUCER_RAW} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} t={t} />;
    case 'cap-bw':
      return <GenericTable entries={CAP_ENTRIES} columns={CAP_COLUMNS} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'valve':
      return <ValveTable data={VALVE_RAW} type={subType} classRating={classRating} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'flange':
      return <FlangeTable entries={FLANGE_ENTRIES} flangeType={subType} classRating={classRating} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'stud-bolt':
      return <ClassFilteredTable entries={STUD_BOLT_ENTRIES} columns={STUD_BOLT_COLUMNS} classRating={classRating} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'gasket':
      return <ClassFilteredTable entries={GASKET_ENTRIES} columns={GASKET_COLUMNS} classRating={classRating} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'stub-end':
      return <GenericTable entries={STUB_END_ENTRIES} columns={STUB_END_COLUMNS} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'olet':
      return <OletTable data={OLET_RAW} type={subType} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'fitting-sw':
      return <TypeFilteredTable entries={SW_FITTING_ENTRIES} type={subType} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'fitting-threaded':
      return <TypeFilteredTable entries={THREADED_FITTING_ENTRIES} type={subType} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'spectacle-blind':
      return <ClassFilteredTable entries={SPECTACLE_BLIND_ENTRIES} columns={SPECTACLE_BLIND_COLUMNS} classRating={classRating} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    case 'y-strainer':
      return <GenericTable entries={Y_STRAINER_ENTRIES} columns={Y_STRAINER_COLUMNS} filterNPS={filterNPS} toUnit={toUnit} unitLabel={unitLabel} />;
    default:
      return <p className="p-4 text-zinc-500">No data available.</p>;
  }
}

/* ─── Generic Table ─── */
type ColDef = { key: string; labelKey: string; align: 'left' | 'right'; isPrimary?: boolean; noUnit?: boolean };

function GenericTable({ entries, columns, filterNPS, toUnit, unitLabel }: { entries: FittingEntry[]; columns: ColDef[]; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string }) {
  const filtered = entries.filter((e) => filterNPS(e.nps));
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-900/95">
        <tr className="border-b border-zinc-800">
          {columns.map((col) => (
            <th key={col.key} className={`px-3 py-2.5 ${col.align === 'left' ? 'text-left' : 'text-right'} ${col.isPrimary ? 'text-[#f59e0b]' : 'text-zinc-500'}`}>
              {col.key === 'nps' || col.noUnit ? col.labelKey : `${col.labelKey} (${unitLabel})`}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filtered.map((entry, idx) => (
          <tr key={idx} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
            {columns.map((col) => {
              if (col.key === 'nps') return <td key={col.key} className="px-3 py-2 font-medium text-zinc-200">{entry.nps}</td>;
              const dim = entry.dimensions.find((d) => d.key === col.key);
              if (!dim) return <td key={col.key} className="px-3 py-2 text-right text-zinc-600">—</td>;
              return (
                <td key={col.key} className={`px-3 py-2 text-right ${dim.isPrimaryAdvance ? 'font-medium text-[#f59e0b]' : 'text-zinc-300'}`}>
                  {col.noUnit ? dim.value_mm : toUnit(dim.value_mm)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Class-Filtered Table ─── */
function ClassFilteredTable({ entries, columns, classRating, filterNPS, toUnit, unitLabel }: { entries: FittingEntry[]; columns: ColDef[]; classRating: number; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string }) {
  const filtered = entries.filter((e) => e.class_rating === classRating && filterNPS(e.nps));
  return <GenericTable entries={filtered} columns={columns} filterNPS={() => true} toUnit={toUnit} unitLabel={unitLabel} />;
}

/* ─── Type-Filtered Table (SW/Threaded) ─── */
function TypeFilteredTable({ entries, type, filterNPS, toUnit, unitLabel }: { entries: FittingEntry[]; type: string; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string }) {
  const filtered = entries.filter((e) => e.type === type && filterNPS(e.nps));
  const hasCenterToEnd = filtered.some((e) => e.dimensions.some((d) => d.key === 'center_to_end'));
  const columns: ColDef[] = [
    { key: 'nps', labelKey: 'NPS', align: 'left' },
    hasCenterToEnd
      ? { key: 'center_to_end', labelKey: 'Center-to-End', align: 'right', isPrimary: true }
      : { key: 'overall_length', labelKey: 'Length', align: 'right', isPrimary: true },
  ];
  return <GenericTable entries={filtered} columns={columns} filterNPS={() => true} toUnit={toUnit} unitLabel={unitLabel} />;
}

/* ─── Flange Table ─── */
function FlangeTable({ entries, flangeType, classRating, filterNPS, toUnit, unitLabel }: { entries: FittingEntry[]; flangeType: string; classRating: number; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string }) {
  const filtered = entries.filter((e) => e.type === flangeType && e.class_rating === classRating && filterNPS(e.nps));
  const columns = flangeType === 'WN' ? FLANGE_COLUMNS_WN : FLANGE_COLUMNS_SO;
  return <GenericTable entries={filtered} columns={columns} filterNPS={() => true} toUnit={toUnit} unitLabel={unitLabel} />;
}

/* ─── Reducer Table ─── */
function ReducerTable({ data, filterNPS, toUnit, unitLabel, t }: { data: { largeNPS: string; smallNPS: string; length: number }[]; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string; t: (key: string) => string }) {
  const filtered = data.filter((r) => filterNPS(r.largeNPS) || filterNPS(r.smallNPS));
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-900/95">
        <tr className="border-b border-zinc-800">
          <th className="px-3 py-2.5 text-left text-zinc-500">{t('tools.accessories.largeNPS')}</th>
          <th className="px-3 py-2.5 text-left text-zinc-500">{t('tools.accessories.smallNPS')}</th>
          <th className="px-3 py-2.5 text-right text-[#f59e0b]">{t('tools.accessories.lengthH')} ({unitLabel})</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((r, i) => (
          <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
            <td className="px-3 py-2 font-medium text-zinc-200">{r.largeNPS}</td>
            <td className="px-3 py-2 text-zinc-300">{r.smallNPS}</td>
            <td className="px-3 py-2 text-right font-medium text-[#f59e0b]">{toUnit(r.length)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Valve Table ─── */
function ValveTable({ data, type, classRating, filterNPS, toUnit, unitLabel }: { data: typeof VALVE_RAW; type: string; classRating: number; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string }) {
  const filtered = data.filter((v) => filterNPS(v.nps));
  const getVal = (row: typeof data[0]): number => {
    const key = `${type.toLowerCase()}${classRating}` as keyof typeof row;
    const val = row[key];
    return typeof val === 'number' ? val : 0;
  };
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-900/95">
        <tr className="border-b border-zinc-800">
          <th className="px-3 py-2.5 text-left text-zinc-500">NPS</th>
          <th className="px-3 py-2.5 text-right text-[#f59e0b]">Face-to-Face ({unitLabel})</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((v) => {
          const ftf = getVal(v);
          return (
            <tr key={v.nps} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
              <td className="px-3 py-2 font-medium text-zinc-200">{v.nps}</td>
              <td className="px-3 py-2 text-right font-medium text-[#f59e0b]">{ftf > 0 ? toUnit(ftf) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─── Olet Table ─── */
function OletTable({ data, type, filterNPS, toUnit, unitLabel }: { data: typeof OLET_RAW; type: string; filterNPS: (nps: string) => boolean; toUnit: (mm: number) => number; unitLabel: string }) {
  const filtered = data.filter((o) => o.type === type && (filterNPS(o.headerNPS) || filterNPS(o.branchNPS)));
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-900/95">
        <tr className="border-b border-zinc-800">
          <th className="px-3 py-2.5 text-left text-zinc-500">Header</th>
          <th className="px-3 py-2.5 text-left text-zinc-500">Branch</th>
          <th className="px-3 py-2.5 text-right text-[#f59e0b]">Height ({unitLabel})</th>
          <th className="px-3 py-2.5 text-right text-zinc-500">Base ⌀ ({unitLabel})</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((o, i) => (
          <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
            <td className="px-3 py-2 font-medium text-zinc-200">{o.headerNPS}</td>
            <td className="px-3 py-2 text-zinc-300">{o.branchNPS}</td>
            <td className="px-3 py-2 text-right font-medium text-[#f59e0b]">{toUnit(o.height)}</td>
            <td className="px-3 py-2 text-right text-zinc-300">{toUnit(o.baseDia)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import { useState } from 'react';
import {
  Wrench,
  Calculator,
  Gauge,
  Ruler,
  Thermometer,
  CircuitBoard,
  Table2,
  GitBranch,
  Scissors,
  Boxes,
  Factory,
  BookOpen,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import UnitConverter from '@/tools/unit-converter/UnitConverter';
import PipeDataTables from '@/tools/pipe-data-tables/PipeDataTables';
import PressureDrop from '@/tools/pressure-drop/PressureDrop';
import ThermalExpansion from '@/tools/thermal-expansion/ThermalExpansion';
import FlangeRating from '@/tools/flange-rating/FlangeRating';
import FittingTakeOff from '@/tools/fitting-takeoff/FittingTakeOff';
import BranchLayout from '@/tools/branch-layout/BranchLayout';
import ElbowCut from '@/tools/elbow-cut/ElbowCut';
import { FlangeLibrary } from '@/tools/flange-library/FlangeLibrary';
import { BranchTemplate } from '@/tools/branch-template/BranchTemplate';

/**
 * TICKET-001 Fase 1: Centro Técnico — 5 blocks organization.
 *
 * Blocks:
 *   1. Fabrication       — tools used in the workshop (cuts, templates, take-offs)
 *   2. Design & Calculation — engineering calculations (thickness, pressure, expansion)
 *   3. Technical Library  — reference data (pipe tables, fittings) [will grow with Fase 2]
 *   4. Inspection & Codes — ratings, compliance
 *   5. Utilities          — converters, helpers
 *
 * Reynolds Number is now merged into Pressure Drop (it was already calculated
 * and displayed inside PressureDrop results). The standalone Reynolds tool is removed.
 *
 * MON-002: Free tier = consultation. Premium tier (future) = exports (PDF, templates).
 */

interface ToolDef {
  key: string;
  nameKey: string;
  icon: LucideIcon;
  block: ToolBlock;
}

type ToolBlock = 'fabrication' | 'design' | 'library' | 'inspection' | 'utility';

const BLOCK_ORDER: ToolBlock[] = ['fabrication', 'design', 'library', 'inspection', 'utility'];

const BLOCK_META: Record<ToolBlock, { nameKey: string; icon: LucideIcon }> = {
  fabrication: { nameKey: 'tools.categoryFabrication', icon: Factory },
  design: { nameKey: 'tools.categoryDesign', icon: Calculator },
  library: { nameKey: 'tools.categoryLibrary', icon: BookOpen },
  inspection: { nameKey: 'tools.categoryInspection', icon: ShieldCheck },
  utility: { nameKey: 'tools.categoryUtility', icon: Wrench },
};

const TOOLS: ToolDef[] = [
  // 🏭 Fabrication
  { key: 'elbow-cut', nameKey: 'tools.elbowCut', icon: Scissors, block: 'fabrication' },
  { key: 'branch-layout', nameKey: 'tools.branchLayout', icon: GitBranch, block: 'fabrication' },
  { key: 'branch-template', nameKey: 'tools.branchTemplate', icon: Scissors, block: 'fabrication' },
  { key: 'fitting-takeoff', nameKey: 'tools.fittingTakeOff', icon: Boxes, block: 'fabrication' },

  // 📐 Design & Calculation
  { key: 'wall-thickness', nameKey: 'tools.wallThickness', icon: Ruler, block: 'design' },
  { key: 'pressure-drop', nameKey: 'tools.pressureDrop', icon: Gauge, block: 'design' },
  { key: 'thermal-expansion', nameKey: 'tools.thermalExpansion', icon: Thermometer, block: 'design' },

  // 📚 Technical Library
  { key: 'pipe-dimensions', nameKey: 'tools.pipeDataTables', icon: Table2, block: 'library' },
  { key: 'flange-library', nameKey: 'tools.flangeLibrary', icon: BookOpen, block: 'library' },

  // 🔍 Inspection & Codes
  { key: 'flange-rating', nameKey: 'tools.flangeRating', icon: CircuitBoard, block: 'inspection' },

  // 🔧 Utilities
  { key: 'unit-converter', nameKey: 'tools.unitConverter', icon: Calculator, block: 'utility' },
];

export default function Tools() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [active, setActive] = useState(TOOLS[0].key);
  const [d, setD] = useState('168.3');
  const [p, setP] = useState('5');
  const [s, setS] = useState('138');
  const [y, setY] = useState('0.4');
  const [result, setResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const compute = async () => {
    const D = Number(d);
    const P = Number(p);
    const S = Number(s);
    const Y = Number(y);
    if (!D || !P || !S) {
      toast.error(t('tools.fillRequired'));
      return;
    }
    const tValue = (P * D) / (2 * (S + P * Y));
    setResult(t('tools.resultThickness', { value: tValue.toFixed(3) }));

    if (user) {
      setSaving(true);
      await supabase.from(TABLES.toolUsage).insert({
        user_id: user.id,
        tool_name: 'Pipe Wall Thickness',
        tool_category: 'Design',
        input_data: { D, P, S, Y },
        output_data: { thickness_mm: Number(tValue.toFixed(3)) },
      });
      setSaving(false);
      toast.success(t('tools.calculationSaved'));
    }
  };

  const activeTool = TOOLS.find((tool) => tool.key === active);

  // Filter tools by search
  const filteredTools = search
    ? TOOLS.filter((tool) => t(tool.nameKey).toLowerCase().includes(search.toLowerCase()))
    : TOOLS;

  // Group filtered tools by block
  const toolsByBlock = BLOCK_ORDER.map((block) => ({
    block,
    tools: filteredTools.filter((tool) => tool.block === block),
  })).filter((group) => group.tools.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('tools.eyebrow')}
        title={t('tools.title')}
        description={t('tools.description')}
      />

      <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
        {/* Sidebar — blocks with tools */}
        <aside className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search', 'Search tools...')}
              className="h-6 w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>

          {/* Mobile: horizontal scrollable tool selector */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const selected = active === tool.key;
              return (
                <button
                  key={tool.key}
                  onClick={() => setActive(tool.key)}
                  className={`flex shrink-0 items-center gap-2 border px-3 py-2 text-xs transition ${
                    selected
                      ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                      : 'border-zinc-800/80 bg-[#0d0d0d] text-zinc-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="whitespace-nowrap">{t(tool.nameKey)}</span>
                </button>
              );
            })}
          </div>

          {/* Desktop: blocks with tools */}
          <div className="hidden lg:block space-y-4">
            {toolsByBlock.map((group) => {
              const BlockIcon = BLOCK_META[group.block].icon;
              return (
                <div key={group.block} className="space-y-1">
                  <div className="flex items-center gap-2 px-3 pb-1">
                    <BlockIcon className="h-3.5 w-3.5 text-zinc-600" />
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">
                      {t(BLOCK_META[group.block].nameKey)}
                    </p>
                  </div>
                  {group.tools.map((tool) => {
                    const Icon = tool.icon;
                    const selected = active === tool.key;
                    return (
                      <button
                        key={tool.key}
                        onClick={() => setActive(tool.key)}
                        className={`group flex w-full items-center gap-3 border px-3 py-2.5 text-left text-sm transition ${
                          selected
                            ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                            : 'border-zinc-800/80 bg-[#0d0d0d] text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-xs">{t(tool.nameKey)}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Tool content */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
          {active === 'wall-thickness' ? (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
                  {t('tools.wallThickness')}
                </p>
                <h3 className="mt-1 text-xl font-semibold">{t('tools.wallThicknessSubtitle')}</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  t = (P·D) / (2·(S + P·Y))
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('tools.outsideDiameter')}
                  </Label>
                  <Input
                    value={d}
                    onChange={(e) => setD(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('tools.designPressure')}
                  </Label>
                  <Input
                    value={p}
                    onChange={(e) => setP(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('tools.allowableStress')}
                  </Label>
                  <Input
                    value={s}
                    onChange={(e) => setS(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('tools.yCoefficient')}
                  </Label>
                  <Input
                    value={y}
                    onChange={(e) => setY(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={compute}
                  disabled={saving}
                  className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
                >
                  {saving ? t('common.saving') : t('common.calculate')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setD('168.3');
                    setP('5');
                    setS('138');
                    setY('0.4');
                    setResult(null);
                  }}
                  className="border-zinc-800 bg-transparent hover:bg-zinc-900"
                >
                  {t('common.reset')}
                </Button>
              </div>

              {result && (
                <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
                    {t('common.result')}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-100">{result}</p>
                </div>
              )}
            </div>
          ) : active === 'unit-converter' ? (
            <UnitConverter user={user} />
          ) : active === 'pipe-dimensions' ? (
            <PipeDataTables user={user} />
          ) : active === 'flange-library' ? (
            <FlangeLibrary user={user} />
          ) : active === 'pressure-drop' ? (
            <PressureDrop user={user} />
          ) : active === 'thermal-expansion' ? (
            <ThermalExpansion user={user} />
          ) : active === 'flange-rating' ? (
            <FlangeRating user={user} />
          ) : active === 'fitting-takeoff' ? (
            <FittingTakeOff user={user} />
          ) : active === 'branch-layout' ? (
            <BranchLayout user={user} />
          ) : active === 'branch-template' ? (
            <BranchTemplate user={user} />
          ) : active === 'elbow-cut' ? (
            <ElbowCut user={user} />
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <Wrench className="h-8 w-8 text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-300">
                {activeTool ? t(activeTool.nameKey) : ''}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {t('tools.comingSoon')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

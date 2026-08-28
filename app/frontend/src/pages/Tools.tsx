import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wrench,
  Calculator,
  Gauge,
  Ruler,
  Thermometer,
  Beaker,
  CircuitBoard,
  Scissors,
  GitBranch,
  Table2,
  Paintbrush,
  ArrowLeft,
  Crown,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { usePremium } from '@/hooks/usePremium';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { redirectToCheckout } from '@/lib/stripe';
import ElbowCutTool from '@/components/tools/ElbowCutTool';
import BranchLayoutTool from '@/components/tools/BranchLayoutTool';
import UnitConverterTool from '@/components/tools/UnitConverterTool';
import PressureDropTool from '@/components/tools/PressureDropTool';
import PipeDimensionsTool from '@/components/tools/PipeDimensionsTool';
import BoltsNutsTool from '@/components/tools/BoltsNutsTool';
import FlangesTool from '@/components/tools/FlangesTool';
import ColorLookup from '@/tools/color-lookup/ColorLookup';
import AccessoriesLibrary from '@/components/tools/AccessoriesLibrary';

interface ToolDef {
  key: string;
  nameKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
  categoryKey: string;
  implemented: boolean;
}

const TOOLS: ToolDef[] = [
  { key: 'bolts-nuts', nameKey: 'tools.bolts.name', descKey: 'tools.bolts.desc', icon: Wrench, categoryKey: 'tools.categoryFabrication', implemented: true },
  { key: 'flanges', nameKey: 'tools.flanges.name', descKey: 'tools.flanges.desc', icon: CircuitBoard, categoryKey: 'tools.categoryReference', implemented: true },
  { key: 'elbow-cut', nameKey: 'tools.elbowCut.name', descKey: 'tools.elbowCut.subtitle', icon: Scissors, categoryKey: 'tools.categoryFabrication', implemented: true },
  { key: 'branch-layout', nameKey: 'tools.branchLayout.name', descKey: 'tools.branchLayout.subtitle', icon: GitBranch, categoryKey: 'tools.categoryFabrication', implemented: true },
  { key: 'pipe-dimensions', nameKey: 'tools.pipeDim.name', descKey: 'tools.pipeDim.subtitle', icon: Table2, categoryKey: 'tools.categoryReference', implemented: true },
  { key: 'pressure-drop', nameKey: 'tools.pressureDrop.name', descKey: 'tools.pressureDrop.subtitle', icon: Gauge, categoryKey: 'tools.categoryHydraulics', implemented: true },
  { key: 'unit-converter', nameKey: 'tools.unitConverter', descKey: 'tools.unitConverterDesc', icon: Calculator, categoryKey: 'tools.categoryUtility', implemented: true },
  { key: 'wall-thickness', nameKey: 'tools.wallThickness', descKey: 'tools.wallThicknessDesc', icon: Ruler, categoryKey: 'tools.categoryDesign', implemented: true },
  { key: 'color-lookup', nameKey: 'tools.colorLookup', descKey: 'tools.colorLookupDesc', icon: Paintbrush, categoryKey: 'tools.categoryReference', implemented: true },
  { key: 'accessories-library', nameKey: 'tools.accessoriesLibrary', descKey: 'tools.accessoriesLibraryDesc', icon: CircuitBoard, categoryKey: 'tools.categoryReference', implemented: true },
  { key: 'thermal-expansion', nameKey: 'tools.thermalExpansion', descKey: 'tools.thermalExpansionDesc', icon: Thermometer, categoryKey: 'tools.categoryStress', implemented: false },
  { key: 'reynolds', nameKey: 'tools.reynolds', descKey: 'tools.reynoldsDesc', icon: Beaker, categoryKey: 'tools.categoryHydraulics', implemented: false },
];

export default function Tools() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status: premiumStatus } = usePremium();

  // The open tool lives in the URL so a tool can be linked, bookmarked and
  // shared, and so the back button leaves the tool instead of the page. It was
  // previously local state only, which made every tool unreachable by URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('t');
  const setActive = (key: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key) next.set('t', key);
        else next.delete('t');
        return next;
      },
      { replace: false },
    );
  };
  const [d, setD] = useState('168.3');
  const [p, setP] = useState('5');
  const [s, setS] = useState('138');
  const [y, setY] = useState('0.4');
  const [result, setResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleUpgrade = async (interval: 'month' | 'year') => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    const productKey = interval === 'month' ? 'premium_tools_monthly' : 'premium_tools_annual';
    const reason = await redirectToCheckout(productKey);
    if (reason === 'not_authenticated') {
      window.location.href = '/login?next=/tools';
    } else if (reason) {
      setCheckoutError('Could not start checkout. Please try again.');
      setCheckoutLoading(false);
    }
    // si null → el browser ya está navegando a Stripe
  };

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

  // ═══════════════════════════════════════════════════════════
  // CATALOG VIEW (Card Grid)
  // ═══════════════════════════════════════════════════════════
  if (!active) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow={t('tools.eyebrow')}
          title={t('tools.title')}
          description={t('tools.description')}
        />

        {/* Upgrade banner — visible only for non-premium users */}
        {!premiumStatus.isPremium && (
          <div className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f59e0b]/10 text-[#f59e0b]">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#F5F7FA]">Unlock Premium Tools</p>
                  <p className="text-[11px] text-[#A3A9B3]">
                    PDF exports, printable templates, torque reports &amp; more.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={checkoutLoading}
                  onClick={() => handleUpgrade('month')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#f59e0b]/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-[#f59e0b] transition hover:bg-[#f59e0b]/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {checkoutLoading ? 'Loading...' : 'Monthly €4.99'}
                </button>
                <button
                  disabled={checkoutLoading}
                  onClick={() => handleUpgrade('year')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#f59e0b] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[#d97706] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {checkoutLoading ? 'Loading...' : 'Annual €39 (save 35%)'}
                </button>
              </div>
            </div>
            {checkoutError && (
              <p className="mt-2 text-[11px] text-red-400">{checkoutError}</p>
            )}
          </div>
        )}

        {/* Card Grid Catalog */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.key}
                onClick={() => tool.implemented && setActive(tool.key)}
                disabled={!tool.implemented}
                className={`group relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-all duration-200 ${
                  tool.implemented
                    ? 'border-[#232A36] bg-[#151A22] hover:border-[#FF8C00]/50 hover:bg-[#151A22]/80 hover:shadow-lg hover:shadow-[#FF8C00]/5 cursor-pointer'
                    : 'border-[#232A36]/50 bg-[#151A22]/50 opacity-50 cursor-not-allowed'
                }`}
              >
                {/* Icon */}
                <div className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
                  tool.implemented
                    ? 'bg-[#FF8C00]/10 text-[#FF8C00] group-hover:bg-[#FF8C00]/20'
                    : 'bg-[#232A36] text-[#A3A9B3]'
                }`}>
                  <Icon className="h-7 w-7" />
                </div>

                {/* Name */}
                <h3 className="text-sm font-semibold text-[#F5F7FA]">
                  {t(tool.nameKey)}
                </h3>

                {/* Description */}
                <p className="text-[11px] text-[#A3A9B3] leading-relaxed">
                  {t(tool.descKey, { defaultValue: t(tool.categoryKey) })}
                </p>

                {/* Category badge */}
                <span className="mt-auto text-[9px] uppercase tracking-[0.2em] text-[#A3A9B3]/60 border border-[#232A36] rounded-full px-2 py-0.5">
                  {t(tool.categoryKey)}
                </span>

                {/* Coming soon badge */}
                {!tool.implemented && (
                  <span className="absolute top-3 right-3 text-[8px] uppercase tracking-wider bg-[#232A36] text-[#A3A9B3] px-2 py-0.5 rounded">
                    {t('tools.comingSoon')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TOOL DETAIL VIEW
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => setActive(null)}
        className="flex items-center gap-2 text-sm text-[#A3A9B3] hover:text-[#FF8C00] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('tools.backToCatalog', { defaultValue: 'Volver al catálogo' })}
      </button>

      {/* Tool content */}
      <div className="rounded-xl border border-[#232A36] bg-[#151A22] p-6">
        {active === 'bolts-nuts' ? (
          <BoltsNutsTool />
        ) : active === 'flanges' ? (
          <FlangesTool />
        ) : active === 'elbow-cut' ? (
          <ElbowCutTool />
        ) : active === 'branch-layout' ? (
          <BranchLayoutTool />
        ) : active === 'unit-converter' ? (
          <UnitConverterTool />
        ) : active === 'pressure-drop' ? (
          <PressureDropTool />
        ) : active === 'pipe-dimensions' ? (
          <PipeDimensionsTool />
        ) : active === 'color-lookup' ? (
          <ColorLookup />
        ) : active === 'accessories-library' ? (
          <AccessoriesLibrary />
        ) : active === 'wall-thickness' ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-[#232A36] pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF8C00]/10 text-[#FF8C00]">
                <Ruler className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#F5F7FA]">{t('tools.wallThickness')}</h3>
                <p className="text-xs text-[#A3A9B3]">ASME B31.3</p>
              </div>
            </div>

            <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-4">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[#A3A9B3]">
                {t('tools.wallThicknessSubtitle')}
              </p>
              <p className="text-sm text-[#A3A9B3] font-mono">
                t = (P·D) / (2·(S + P·Y))
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.outsideDiameter')}
                </Label>
                <Input
                  value={d}
                  onChange={(e) => setD(e.target.value)}
                  className="bg-[#0E1117] border-[#232A36] focus-visible:ring-[#FF8C00]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.designPressure')}
                </Label>
                <Input
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  className="bg-[#0E1117] border-[#232A36] focus-visible:ring-[#FF8C00]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.allowableStress')}
                </Label>
                <Input
                  value={s}
                  onChange={(e) => setS(e.target.value)}
                  className="bg-[#0E1117] border-[#232A36] focus-visible:ring-[#FF8C00]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
                  {t('tools.yCoefficient')}
                </Label>
                <Input
                  value={y}
                  onChange={(e) => setY(e.target.value)}
                  className="bg-[#0E1117] border-[#232A36] focus-visible:ring-[#FF8C00]"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={compute}
                disabled={saving}
                className="bg-[#FF8C00] text-black hover:bg-[#e07b00] font-semibold"
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
                className="border-[#232A36] !bg-transparent hover:!bg-[#232A36]"
              >
                {t('common.reset')}
              </Button>
            </div>

            {result && (
              <div className="border-l-2 border-[#FF8C00] bg-[#FF8C00]/5 p-4 rounded-r-lg">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#FF8C00]">
                  {t('common.result')}
                </p>
                <p className="mt-1 text-lg font-semibold text-[#F5F7FA]">{result}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
            <Wrench className="h-8 w-8 text-[#A3A9B3]" />
            <p className="mt-3 text-sm text-[#F5F7FA]">
              {t('tools.comingSoon')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
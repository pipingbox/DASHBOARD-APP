import { useState } from 'react';
import {
  Wrench,
  Calculator,
  Gauge,
  Ruler,
  Thermometer,
  Beaker,
  CircuitBoard,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';

interface ToolDef {
  key: string;
  nameKey: string;
  icon: React.ComponentType<{ className?: string }>;
  categoryKey: string;
}

const TOOLS: ToolDef[] = [
  { key: 'wall-thickness', nameKey: 'tools.wallThickness', icon: Ruler, categoryKey: 'tools.categoryDesign' },
  { key: 'pressure-drop', nameKey: 'tools.pressureDrop', icon: Gauge, categoryKey: 'tools.categoryHydraulics' },
  { key: 'unit-converter', nameKey: 'tools.unitConverter', icon: Calculator, categoryKey: 'tools.categoryUtility' },
  { key: 'thermal-expansion', nameKey: 'tools.thermalExpansion', icon: Thermometer, categoryKey: 'tools.categoryStress' },
  { key: 'reynolds', nameKey: 'tools.reynolds', icon: Beaker, categoryKey: 'tools.categoryHydraulics' },
  { key: 'flange-rating', nameKey: 'tools.flangeRating', icon: CircuitBoard, categoryKey: 'tools.categoryReference' },
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('tools.eyebrow')}
        title={t('tools.title')}
        description={t('tools.description')}
      />

      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <aside className="space-y-1">
          <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            {t('tools.catalog')}
          </p>
          {TOOLS.map((tool) => {
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
                <Icon className="h-4 w-4" />
                <div className="flex-1">
                  <div>{t(tool.nameKey)}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    {t(tool.categoryKey)}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

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
/**
 * WorkDayMonthReport — Modal para generar el informe mensual en PDF.
 *
 * Permite al trabajador:
 *  1. Seleccionar el mes y año del informe.
 *  2. Activar/desactivar columnas opcionales (tarifas, km, dietas…).
 *  3. Ver un resumen de estadísticas antes de generar.
 *  4. Descargar el PDF listo para enviar a la empresa.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, Loader2, ChevronLeft, ChevronRight, Settings2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { WorkDayLog, monthBounds } from '@/lib/workDayLogs';
import { formatCurrency } from '@/lib/currency';
import { CurrencyCode } from '@/lib/currency';
import { downloadMonthlyPdf, DEFAULT_COLUMN_CONFIG, PdfColumnConfig, computeMonthTotals } from '@/lib/workDayPdf';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// ─── Column toggle definition ─────────────────────────────────────────────────

interface ColumnToggle {
  key: keyof PdfColumnConfig;
  labelKey: string;
  defaultLabel: string;
  essential?: boolean; // cannot be disabled
}

const COLUMN_TOGGLES: ColumnToggle[] = [
  { key: 'showLocation',        labelKey: 'workday.location',           defaultLabel: 'Location',          essential: true },
  { key: 'showNormalHours',     labelKey: 'workday.normalHours',        defaultLabel: 'Normal hours',      essential: true },
  { key: 'showExtraHours',      labelKey: 'workday.extraHours',         defaultLabel: 'Extra hours' },
  { key: 'showTotalHours',      labelKey: 'workday.totalHours',         defaultLabel: 'Total hours',       essential: true },
  { key: 'showNormalRate',      labelKey: 'workday.normalRate',         defaultLabel: 'Normal rate (€/h)' },
  { key: 'showExtraRate',       labelKey: 'workday.extraRate',          defaultLabel: 'Extra rate (€/h)' },
  { key: 'showGrossSalary',     labelKey: 'workday.grossSalary',        defaultLabel: 'Gross salary' },
  { key: 'showKilometers',      labelKey: 'workday.kilometersDriven',   defaultLabel: 'Kilometers' },
  { key: 'showTravelAllowance', labelKey: 'workday.travelAllowance',    defaultLabel: 'Travel allowance' },
  { key: 'showFinalTotal',      labelKey: 'workday.finalDayTotal',      defaultLabel: 'Day total',         essential: true },
  { key: 'showNotes',           labelKey: 'workday.notes',              defaultLabel: 'Notes' },
];

const MONTH_NAMES_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ─── Component ────────────────────────────────────────────────────────────────

interface WorkDayMonthReportProps {
  /** Pre-loaded logs for the current calendar month (optional optimisation) */
  currentMonthLogs?: WorkDayLog[];
  currentYear?: number;
  currentMonthIndex?: number;
  trigger?: React.ReactNode;
}

export function WorkDayMonthReport({
  currentMonthLogs,
  currentYear,
  currentMonthIndex,
  trigger,
}: WorkDayMonthReportProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();

  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(currentYear ?? now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(currentMonthIndex ?? now.getMonth());
  const [columns, setColumns] = useState<PdfColumnConfig>(DEFAULT_COLUMN_CONFIG);
  const [showSignature, setShowSignature] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<WorkDayLog[] | null>(null); // null = use currentMonthLogs

  // Load logs for selected month when it differs from current calendar view
  const activeYear = year;
  const activeMonth = monthIndex;

  const monthLabel = `${MONTH_NAMES_EN[activeMonth]} ${activeYear}`;

  const activeLogs = useMemo(() => {
    if (logs !== null) return logs;
    if (
      currentMonthLogs &&
      currentYear === activeYear &&
      currentMonthIndex === activeMonth
    ) return currentMonthLogs;
    return null;
  }, [logs, currentMonthLogs, currentYear, currentMonthIndex, activeYear, activeMonth]);

  const totals = useMemo(
    () => (activeLogs && activeLogs.length > 0 ? computeMonthTotals(activeLogs) : null),
    [activeLogs],
  );

  // Load month logs when dialog opens or month changes
  const loadLogs = async (y: number, m: number) => {
    if (!user) return;
    setLoading(true);
    setLogs(null);
    const { start, end } = monthBounds(y, m);
    const { data } = await supabase
      .from(TABLES.workDayLogs)
      .select('*')
      .eq('user_id', user.id)
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date');
    setLogs((data as WorkDayLog[]) ?? []);
    setLoading(false);
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && activeLogs === null) void loadLogs(activeYear, activeMonth);
  };

  const handleMonthChange = (delta: number) => {
    let m = monthIndex + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonthIndex(m);
    setYear(y);
    void loadLogs(y, m);
  };

  const toggleColumn = (key: keyof PdfColumnConfig) => {
    const def = COLUMN_TOGGLES.find((c) => c.key === key);
    if (def?.essential) return; // cannot toggle essential columns
    setColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerate = () => {
    if (!activeLogs || activeLogs.length === 0) return;
    const workerName = (profile?.full_name as string | null)?.trim() || user?.email || 'Worker';
    downloadMonthlyPdf(activeLogs, {
      workerName,
      companyName: companyName.trim() || undefined,
      monthLabel,
      columns,
      includeSignatureBlock: showSignature,
    });
  };

  const fmt = (n: number) => formatCurrency(n, (totals?.currency ?? 'EUR') as CurrencyCode);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="!bg-transparent h-8 border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            {t('workday.monthlyReport', 'Monthly report')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <FileDown className="h-4 w-4 text-[#f59e0b]" />
            {t('workday.monthlyReport', 'Monthly report')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ── Month selector ── */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
            <button
              onClick={() => handleMonthChange(-1)}
              className="rounded p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-zinc-100">{monthLabel}</span>
            <button
              onClick={() => handleMonthChange(1)}
              className="rounded p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              disabled={year > now.getFullYear() || (year === now.getFullYear() && monthIndex >= now.getMonth())}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ── Stats preview ── */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : activeLogs && activeLogs.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-4">
              {t('dashboard.noLogsYet', 'No entries for this month.')}
            </p>
          ) : totals ? (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t('workday.daysWorked', 'Days'), value: totals.daysWorked },
                { label: t('workday.totalHours', 'Total h'), value: `${totals.totalHours} h` },
                { label: t('workday.grossSalary', 'Gross'), value: fmt(totals.grossSalary) },
                { label: t('workday.finalTotal', 'Grand total'), value: fmt(totals.grandTotal) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-[#f59e0b]">{value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* ── Column toggles ── */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Settings2 className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t('workday.pdfColumns', 'Columns to include')}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {COLUMN_TOGGLES.map(({ key, labelKey, defaultLabel, essential }) => {
                const active = columns[key];
                return (
                  <button
                    key={key}
                    onClick={() => toggleColumn(key)}
                    disabled={essential}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors text-left',
                      active
                        ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-zinc-200'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500',
                      essential && 'cursor-default opacity-70',
                    )}
                  >
                    {active
                      ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-[#f59e0b]" />
                      : <Square className="h-3.5 w-3.5 shrink-0" />}
                    {t(labelKey, defaultLabel)}
                    {essential && <span className="ml-auto text-[9px] text-zinc-600">req.</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Options ── */}
          <div className="space-y-2">
            {/* Company name */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                {t('workday.companyName', 'Company name (optional)')}
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Piping S.L."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#f59e0b] focus:outline-none"
              />
            </div>

            {/* Signature block toggle */}
            <button
              onClick={() => setShowSignature((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors w-full text-left',
                showSignature
                  ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-zinc-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500',
              )}
            >
              {showSignature
                ? <CheckSquare className="h-3.5 w-3.5 text-[#f59e0b]" />
                : <Square className="h-3.5 w-3.5" />}
              {t('workday.includeSignatureBlock', 'Include signature block')}
            </button>
          </div>

          {/* ── Generate button ── */}
          <Button
            className="w-full bg-[#f59e0b] text-zinc-900 hover:bg-[#d97706] font-semibold"
            onClick={handleGenerate}
            disabled={loading || !activeLogs || activeLogs.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            {t('workday.downloadPdf', 'Download PDF')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

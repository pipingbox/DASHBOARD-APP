import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyCode, DEFAULT_CURRENCY, formatCurrency } from '@/lib/currency';
import { WorkDayLog, toIsoDate } from '@/lib/workDayLogs';

interface WorkDayCalendarProps {
  year: number;
  monthIndex: number; // 0-11
  logs: WorkDayLog[];
  onChangeMonth: (year: number, monthIndex: number) => void;
  onDayClick: (dateIso: string, existing: WorkDayLog | null) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WorkDayCalendar({
  year,
  monthIndex,
  logs,
  onChangeMonth,
  onDayClick,
}: WorkDayCalendarProps) {
  const logsByDate = useMemo(() => {
    const map = new Map<string, WorkDayLog>();
    for (const l of logs) map.set(l.log_date, l);
    return map;
  }, [logs]);

  const todayStr = toIsoDate(new Date());

  // Build a Monday-first 6x7 grid
  const cells = useMemo(() => {
    const first = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    // Monday=0 … Sunday=6
    const firstWeekday = (first.getDay() + 6) % 7;
    const out: { iso: string; day: number; inMonth: boolean }[] = [];
    // Leading blanks from previous month
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(year, monthIndex, 1 - (firstWeekday - i));
      out.push({ iso: toIsoDate(d), day: d.getDate(), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, monthIndex, d);
      out.push({ iso: toIsoDate(date), day: d, inMonth: true });
    }
    // Trailing so we fill multiples of 7
    while (out.length % 7 !== 0) {
      const last = new Date(year, monthIndex, daysInMonth + (out.length - (firstWeekday + daysInMonth) + 1));
      out.push({ iso: toIsoDate(last), day: last.getDate(), inMonth: false });
    }
    return out;
  }, [year, monthIndex]);

  const prev = () => {
    const d = new Date(year, monthIndex - 1, 1);
    onChangeMonth(d.getFullYear(), d.getMonth());
  };
  const next = () => {
    const d = new Date(year, monthIndex + 1, 1);
    onChangeMonth(d.getFullYear(), d.getMonth());
  };
  const thisMonth = () => {
    const d = new Date();
    onChangeMonth(d.getFullYear(), d.getMonth());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            Monthly overview
          </p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">
            {MONTH_NAMES[monthIndex]} {year}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="!bg-transparent !hover:bg-transparent h-8 border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
            onClick={prev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="!bg-transparent !hover:bg-transparent h-8 border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b] text-[10px] uppercase tracking-[0.2em]"
            onClick={thisMonth}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="!bg-transparent !hover:bg-transparent h-8 border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
            onClick={next}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-zinc-800 mb-1">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-zinc-900/60">
        {cells.map((c) => {
          const log = logsByDate.get(c.iso) ?? null;
          const isToday = c.iso === todayStr;
          const hasEntry = Boolean(log);
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onDayClick(c.iso, log)}
              className={[
                'relative aspect-square sm:aspect-[1.1/1] p-1.5 sm:p-2 text-left transition',
                'flex flex-col justify-between',
                c.inMonth ? 'bg-[#0d0d0d]' : 'bg-[#080808]',
                hasEntry
                  ? 'ring-1 ring-inset ring-emerald-500/70 bg-emerald-500/10 hover:bg-emerald-500/20'
                  : 'hover:bg-zinc-900/70',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    'text-xs font-mono',
                    c.inMonth ? 'text-zinc-300' : 'text-zinc-700',
                    isToday ? 'px-1.5 py-0.5 bg-[#f59e0b] text-black' : '',
                  ].join(' ')}
                >
                  {c.day}
                </span>
                {hasEntry && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </div>
              {hasEntry && log && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-emerald-300 truncate">
                    {(Number(log.normal_hours) + Number(log.extra_hours)).toFixed(1)}h
                  </p>
                  <p className="text-[10px] font-mono text-zinc-300 truncate">
                    {formatCurrency(
                      Number(log.final_total || log.total_salary || 0),
                      (log.currency as CurrencyCode) || DEFAULT_CURRENCY,
                      { maximumFractionDigits: 0 },
                    )}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Saved entry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-[#f59e0b]" /> Today
        </span>
      </div>
    </div>
  );
}
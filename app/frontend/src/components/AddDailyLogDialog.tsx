import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  CurrencyCode,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  formatCurrency,
  getCurrencySymbol,
} from '@/lib/currency';

interface AddDailyLogDialogProps {
  onCreated?: () => void;
  trigger?: React.ReactNode;
}

const todayIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

interface FormState {
  log_date: string;
  iso: string;
  welders: string;
  hours_normal: string;
  hours_extra: string;
  normal_rate: string;
  extra_rate: string;
  currency: CurrencyCode;
  notes: string;
}

const initialForm: FormState = {
  log_date: todayIso(),
  iso: '',
  welders: '',
  hours_normal: '',
  hours_extra: '0',
  normal_rate: '',
  extra_rate: '',
  currency: DEFAULT_CURRENCY,
  notes: '',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function AddDailyLogDialog({ onCreated, trigger }: AddDailyLogDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const { normalSalary, extraSalary, totalSalary } = useMemo(() => {
    const hn = Number(form.hours_normal) || 0;
    const he = Number(form.hours_extra) || 0;
    const rn = Number(form.normal_rate) || 0;
    const re = Number(form.extra_rate) || 0;
    const ns = round2(hn * rn);
    const es = round2(he * re);
    return { normalSalary: ns, extraSalary: es, totalSalary: round2(ns + es) };
  }, [form.hours_normal, form.hours_extra, form.normal_rate, form.extra_rate]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.log_date) next.log_date = 'Date is required';
    if (!form.iso.trim()) next.iso = 'ISO number is required';

    const welders = Number(form.welders);
    if (!form.welders || Number.isNaN(welders) || welders < 0) {
      next.welders = 'Enter a valid welders count';
    }

    const hn = Number(form.hours_normal);
    if (form.hours_normal === '' || Number.isNaN(hn) || hn < 0) {
      next.hours_normal = 'Enter normal hours (0 or more)';
    } else if (hn > 24) {
      next.hours_normal = 'Must be 24 or less';
    }

    const he = Number(form.hours_extra);
    if (form.hours_extra !== '' && (Number.isNaN(he) || he < 0)) {
      next.hours_extra = 'Enter valid extra hours';
    } else if (he > 24) {
      next.hours_extra = 'Must be 24 or less';
    }

    const rn = Number(form.normal_rate);
    if (form.normal_rate === '' || Number.isNaN(rn) || rn < 0) {
      next.normal_rate = 'Enter a valid normal hourly rate';
    }

    const re = Number(form.extra_rate);
    if (form.extra_rate !== '' && (Number.isNaN(re) || re < 0)) {
      next.extra_rate = 'Enter a valid extra hourly rate';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be signed in');
      return;
    }
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from(TABLES.dailyLogs).insert({
      user_id: user.id,
      log_date: form.log_date,
      iso: form.iso.trim(),
      welders: Number(form.welders),
      hours_normal: Number(form.hours_normal),
      hours_extra: Number(form.hours_extra || 0),
      normal_rate: Number(form.normal_rate),
      extra_rate: Number(form.extra_rate || 0),
      normal_salary: normalSalary,
      extra_salary: extraSalary,
      total_salary: totalSalary,
      currency: form.currency,
      notes: form.notes.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error('Failed to save daily log', { description: error.message });
      return;
    }

    toast.success('Daily log saved', {
      description: `ISO ${form.iso.trim()} — ${formatCurrency(totalSalary, form.currency)} gross`,
    });
    setForm(initialForm);
    setOpen(false);
    onCreated?.();
  };

  const symbol = getCurrencySymbol(form.currency);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors({});
      }}
    >
      <SheetTrigger asChild>
        {trigger ?? (
          <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            Add Daily Log
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-[#0a0a0a] border-l border-zinc-800 text-zinc-100 overflow-y-auto"
      >
        <SheetHeader className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            Daily Pipe Log
          </p>
          <SheetTitle className="text-zinc-100">New entry</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Record ISO, welder allocation, hours and gross salary for the day.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="log_date" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Date <span className="text-[#f59e0b]">*</span>
              </Label>
              <Input
                id="log_date"
                type="date"
                value={form.log_date}
                onChange={(e) => update('log_date', e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
              />
              {errors.log_date && <p className="text-xs text-red-500">{errors.log_date}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Currency
              </Label>
              <select
                id="currency"
                value={form.currency}
                onChange={(e) => update('currency', e.target.value as CurrencyCode)}
                className="flex h-9 w-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f59e0b]"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iso" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              ISO number <span className="text-[#f59e0b]">*</span>
            </Label>
            <Input
              id="iso"
              placeholder="e.g. ISO-PL-2041"
              value={form.iso}
              onChange={(e) => update('iso', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b] font-mono"
            />
            {errors.iso && <p className="text-xs text-red-500">{errors.iso}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="welders" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Welders count <span className="text-[#f59e0b]">*</span>
            </Label>
            <Input
              id="welders"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 4"
              value={form.welders}
              onChange={(e) => update('welders', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
            />
            {errors.welders && <p className="text-xs text-red-500">{errors.welders}</p>}
          </div>

          {/* Hours */}
          <div className="border-t border-zinc-800/60 pt-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">Hours</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hours_normal" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Normal hours <span className="text-[#f59e0b]">*</span>
                </Label>
                <Input
                  id="hours_normal"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  placeholder="8"
                  value={form.hours_normal}
                  onChange={(e) => update('hours_normal', e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
                />
                {errors.hours_normal && (
                  <p className="text-xs text-red-500">{errors.hours_normal}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="hours_extra" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Extra hours
                </Label>
                <Input
                  id="hours_extra"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  placeholder="0"
                  value={form.hours_extra}
                  onChange={(e) => update('hours_extra', e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
                />
                {errors.hours_extra && (
                  <p className="text-xs text-red-500">{errors.hours_extra}</p>
                )}
              </div>
            </div>
          </div>

          {/* Rates */}
          <div className="border-t border-zinc-800/60 pt-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">
              Gross hourly rates
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="normal_rate" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Normal rate ({symbol}) <span className="text-[#f59e0b]">*</span>
                </Label>
                <Input
                  id="normal_rate"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 25.00"
                  value={form.normal_rate}
                  onChange={(e) => update('normal_rate', e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
                />
                {errors.normal_rate && (
                  <p className="text-xs text-red-500">{errors.normal_rate}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="extra_rate" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Extra rate ({symbol})
                </Label>
                <Input
                  id="extra_rate"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 37.50"
                  value={form.extra_rate}
                  onChange={(e) => update('extra_rate', e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
                />
                {errors.extra_rate && (
                  <p className="text-xs text-red-500">{errors.extra_rate}</p>
                )}
              </div>
            </div>
          </div>

          {/* Auto-calculated gross salary */}
          <div className="border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b] mb-3">
              Gross salary (auto)
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">Normal gross salary</dt>
                <dd className="font-mono text-zinc-100">
                  {formatCurrency(normalSalary, form.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">Extra gross salary</dt>
                <dd className="font-mono text-zinc-100">
                  {formatCurrency(extraSalary, form.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-800 pt-2 mt-2">
                <dt className="text-xs uppercase tracking-[0.2em] text-zinc-300">
                  Total gross
                </dt>
                <dd className="font-mono text-lg font-semibold text-[#f59e0b]">
                  {formatCurrency(totalSalary, form.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[10px] text-zinc-600">
              Gross salary only — taxes and deductions are not calculated.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Any blockers, observations, or context for the crew…"
              rows={3}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b] resize-none"
            />
          </div>

          <SheetFooter className="mt-4 flex-row gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save entry'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
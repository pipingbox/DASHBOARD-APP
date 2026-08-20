import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
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
import {
  RatePreset,
  WorkDayLog,
  computeSalary,
  todayIso,
} from '@/lib/workDayLogs';
import { RatePresetManager } from './RatePresetManager';

interface WorkDayLogDialogProps {
  onChanged?: () => void;
  trigger?: React.ReactNode;
  // Controlled-open mode, used from calendar day clicks.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Prefill for a specific date
  initialDate?: string;
  // Existing log being edited
  existingLog?: WorkDayLog | null;
}

interface FormState {
  log_date: string;
  location: string;
  normal_hours: string;
  extra_hours: string;
  normal_rate: string;
  extra_rate: string;
  kilometers: string;
  kilometer_rate: string;
  travel_allowance_override: string; // allows user to type a flat allowance
  currency: CurrencyCode;
  notes: string;
  preset_id: string | null;
}

const makeInitial = (date?: string): FormState => ({
  log_date: date || todayIso(),
  location: '',
  normal_hours: '',
  extra_hours: '0',
  normal_rate: '',
  extra_rate: '',
  kilometers: '',
  kilometer_rate: '',
  travel_allowance_override: '',
  currency: DEFAULT_CURRENCY,
  notes: '',
  preset_id: null,
});

export function WorkDayLogDialog({
  onChanged,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialDate,
  existingLog,
}: WorkDayLogDialogProps) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) controlledOnOpenChange?.(v);
    else setInternalOpen(v);
  };

  const [presets, setPresets] = useState<RatePreset[]>([]);
  const [form, setForm] = useState<FormState>(makeInitial(initialDate));
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const [presetEditId, setPresetEditId] = useState<string | null>(null);

  const loadPresets = async () => {
    // Use supabase.auth.getUser() for a fresh, server-validated user id
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from(TABLES.ratePresets)
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setPresets((data as RatePreset[]) ?? []);
  };

  useEffect(() => {
    if (open) loadPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  // Prefill from existing log or initialDate when opening
  useEffect(() => {
    if (!open) return;
    if (existingLog) {
      setForm({
        log_date: existingLog.log_date,
        location: existingLog.location ?? '',
        normal_hours: String(existingLog.normal_hours ?? ''),
        extra_hours: String(existingLog.extra_hours ?? '0'),
        normal_rate: String(existingLog.normal_rate ?? ''),
        extra_rate: String(existingLog.extra_rate ?? ''),
        kilometers:
          existingLog.kilometers != null && existingLog.kilometers !== 0
            ? String(existingLog.kilometers)
            : '',
        kilometer_rate:
          existingLog.kilometer_rate != null && existingLog.kilometer_rate !== 0
            ? String(existingLog.kilometer_rate)
            : '',
        travel_allowance_override: '',
        currency: (existingLog.currency as CurrencyCode) || DEFAULT_CURRENCY,
        notes: existingLog.notes ?? '',
        preset_id: existingLog.preset_id,
      });
    } else {
      setForm(makeInitial(initialDate));
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingLog?.id, initialDate]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const applyPreset = (presetId: string) => {
    if (presetId === '') {
      update('preset_id', null);
      return;
    }
    const p = presets.find((pr) => pr.id === presetId);
    if (!p) return;
    setForm((prev) => ({
      ...prev,
      preset_id: p.id,
      location: p.location ?? prev.location,
      normal_rate: String(p.normal_rate ?? prev.normal_rate),
      extra_rate: String(p.extra_rate ?? prev.extra_rate),
      kilometer_rate:
        p.kilometer_rate != null && p.kilometer_rate !== 0
          ? String(p.kilometer_rate)
          : prev.kilometer_rate,
      currency: (p.currency as CurrencyCode) || prev.currency,
    }));
  };

  const salary = useMemo(
    () =>
      computeSalary({
        normalHours: Number(form.normal_hours) || 0,
        extraHours: Number(form.extra_hours) || 0,
        normalRate: Number(form.normal_rate) || 0,
        extraRate: Number(form.extra_rate) || 0,
        kilometers: Number(form.kilometers) || 0,
        kilometerRate: Number(form.kilometer_rate) || 0,
        travelAllowanceOverride:
          form.travel_allowance_override === ''
            ? null
            : Number(form.travel_allowance_override),
      }),
    [
      form.normal_hours,
      form.extra_hours,
      form.normal_rate,
      form.extra_rate,
      form.kilometers,
      form.kilometer_rate,
      form.travel_allowance_override,
    ],
  );

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.log_date) next.log_date = 'Date is required';
    if (!form.location.trim()) next.location = 'Location is required';

    const hn = Number(form.normal_hours);
    if (form.normal_hours === '' || Number.isNaN(hn) || hn < 0) {
      next.normal_hours = 'Enter normal hours';
    } else if (hn > 24) next.normal_hours = 'Must be 24 or less';

    const he = Number(form.extra_hours);
    if (form.extra_hours !== '' && (Number.isNaN(he) || he < 0)) {
      next.extra_hours = 'Invalid';
    } else if (he > 24) next.extra_hours = 'Must be 24 or less';

    const rn = Number(form.normal_rate);
    if (form.normal_rate === '' || Number.isNaN(rn) || rn < 0) {
      next.normal_rate = 'Enter normal rate';
    }
    const re = Number(form.extra_rate);
    if (form.extra_rate === '' || Number.isNaN(re) || re < 0) {
      next.extra_rate = 'Enter extra rate';
    }

    if (form.kilometers !== '') {
      const k = Number(form.kilometers);
      if (Number.isNaN(k) || k < 0) next.kilometers = 'Invalid';
    }
    if (form.kilometer_rate !== '') {
      const k = Number(form.kilometer_rate);
      if (Number.isNaN(k) || k < 0) next.kilometer_rate = 'Invalid';
    }
    if (form.travel_allowance_override !== '') {
      const t = Number(form.travel_allowance_override);
      if (Number.isNaN(t) || t < 0) next.travel_allowance_override = 'Invalid';
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
    const payload = {
      user_id: user.id,
      log_date: form.log_date,
      location: form.location.trim(),
      normal_hours: Number(form.normal_hours),
      extra_hours: Number(form.extra_hours || 0),
      normal_rate: Number(form.normal_rate),
      extra_rate: Number(form.extra_rate || 0),
      normal_salary: salary.normalSalary,
      extra_salary: salary.extraSalary,
      total_salary: salary.totalSalary,
      kilometers: form.kilometers === '' ? 0 : Number(form.kilometers),
      kilometer_rate: form.kilometer_rate === '' ? 0 : Number(form.kilometer_rate),
      travel_allowance: salary.travelAllowance,
      final_total: salary.finalTotal,
      currency: form.currency,
      notes: form.notes.trim() || null,
      preset_id: form.preset_id,
    };

    let error;
    if (existingLog) {
      ({ error } = await supabase
        .from(TABLES.workDayLogs)
        .update(payload)
        .eq('id', existingLog.id)
        .eq('user_id', user.id));
    } else {
      // Upsert on (user_id, log_date) — if a log exists for this date, update it.
      ({ error } = await supabase
        .from(TABLES.workDayLogs)
        .upsert(payload, { onConflict: 'user_id,log_date' }));
    }
    setSubmitting(false);

    if (error) {
      toast.error('Failed to save workday', { description: error.message });
      return;
    }

    toast.success(existingLog ? 'Workday updated' : 'Workday saved', {
      description: `${form.log_date} • ${formatCurrency(salary.finalTotal, form.currency)} total`,
    });
    setOpen(false);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!user || !existingLog) return;
    if (!window.confirm('Delete this workday entry?')) return;
    setDeleting(true);
    const { error } = await supabase
      .from(TABLES.workDayLogs)
      .delete()
      .eq('id', existingLog.id)
      .eq('user_id', user.id);
    setDeleting(false);
    if (error) {
      toast.error('Failed to delete', { description: error.message });
      return;
    }
    toast.success('Workday deleted');
    setOpen(false);
    onChanged?.();
  };

  const symbol = getCurrencySymbol(form.currency);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setErrors({});
        }}
      >
        {!isControlled && (
          <SheetTrigger asChild>
            {trigger ?? (
              <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                Add Workday
              </Button>
            )}
          </SheetTrigger>
        )}
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg bg-[#0a0a0a] border-l border-zinc-800 text-zinc-100 overflow-y-auto"
        >
          <SheetHeader className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
              Work Day / Salary Log
            </p>
            <SheetTitle className="text-zinc-100">
              {existingLog ? 'Edit workday' : 'New workday entry'}
            </SheetTitle>
            <SheetDescription className="text-zinc-500">
              Track hours, gross salary, location and optional travel allowance.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Preset selector */}
            <div className="space-y-2">
              <Label
                htmlFor="preset"
                className="text-xs uppercase tracking-[0.2em] text-zinc-400"
              >
                Rate preset
              </Label>
              <div className="flex gap-2">
                <select
                  id="preset"
                  value={form.preset_id ?? ''}
                  onChange={(e) => applyPreset(e.target.value)}
                  className="flex h-9 flex-1 border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f59e0b]"
                >
                  <option value="">— No preset —</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
                  onClick={() => {
                    setPresetEditId(form.preset_id);
                    setPresetManagerOpen(true);
                  }}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-zinc-600">
                Selecting a preset auto-fills location and rates. You can still edit each field.
              </p>
            </div>

            {/* Date + currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="log_date"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
                  Date <span className="text-[#f59e0b]">*</span>
                </Label>
                <Input
                  id="log_date"
                  type="date"
                  value={form.log_date}
                  onChange={(e) => update('log_date', e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                />
                {errors.log_date && (
                  <p className="text-xs text-red-500">{errors.log_date}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="currency"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
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

            {/* Location */}
            <div className="space-y-2">
              <Label
                htmlFor="location"
                className="text-xs uppercase tracking-[0.2em] text-zinc-400"
              >
                Work location / site <span className="text-[#f59e0b]">*</span>
              </Label>
              <Input
                id="location"
                placeholder="e.g. Fluxys Loenhout"
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
              />
              {errors.location && <p className="text-xs text-red-500">{errors.location}</p>}
            </div>

            {/* Hours */}
            <div className="border-t border-zinc-800/60 pt-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">
                Hours
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="normal_hours"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                  >
                    Normal hours <span className="text-[#f59e0b]">*</span>
                  </Label>
                  <Input
                    id="normal_hours"
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    placeholder="8"
                    value={form.normal_hours}
                    onChange={(e) => update('normal_hours', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                  />
                  {errors.normal_hours && (
                    <p className="text-xs text-red-500">{errors.normal_hours}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="extra_hours"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                  >
                    Extra hours
                  </Label>
                  <Input
                    id="extra_hours"
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    placeholder="0"
                    value={form.extra_hours}
                    onChange={(e) => update('extra_hours', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                  />
                  {errors.extra_hours && (
                    <p className="text-xs text-red-500">{errors.extra_hours}</p>
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
                  <Label
                    htmlFor="normal_rate"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                  >
                    Normal rate ({symbol}) <span className="text-[#f59e0b]">*</span>
                  </Label>
                  <Input
                    id="normal_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="25.00"
                    value={form.normal_rate}
                    onChange={(e) => update('normal_rate', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                  />
                  {errors.normal_rate && (
                    <p className="text-xs text-red-500">{errors.normal_rate}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="extra_rate"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                  >
                    Extra rate ({symbol}) <span className="text-[#f59e0b]">*</span>
                  </Label>
                  <Input
                    id="extra_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="37.50"
                    value={form.extra_rate}
                    onChange={(e) => update('extra_rate', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                  />
                  {errors.extra_rate && (
                    <p className="text-xs text-red-500">{errors.extra_rate}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Travel */}
            <div className="border-t border-zinc-800/60 pt-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">
                Travel (optional)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="kilometers"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                  >
                    Kilometers driven
                  </Label>
                  <Input
                    id="kilometers"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={form.kilometers}
                    onChange={(e) => update('kilometers', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                  />
                  {errors.kilometers && (
                    <p className="text-xs text-red-500">{errors.kilometers}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="kilometer_rate"
                    className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                  >
                    Km rate ({symbol}/km)
                  </Label>
                  <Input
                    id="kilometer_rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0.30"
                    value={form.kilometer_rate}
                    onChange={(e) => update('kilometer_rate', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
                  />
                  {errors.kilometer_rate && (
                    <p className="text-xs text-red-500">{errors.kilometer_rate}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <Label
                  htmlFor="travel_override"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
                  Travel allowance total (override)
                </Label>
                <Input
                  id="travel_override"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Leave blank to auto-calc from km × rate"
                  value={form.travel_allowance_override}
                  onChange={(e) => update('travel_allowance_override', e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b]"
                />
                {errors.travel_allowance_override && (
                  <p className="text-xs text-red-500">{errors.travel_allowance_override}</p>
                )}
              </div>
            </div>

            {/* Live totals */}
            <div className="border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b] mb-3">
                Day totals (auto)
              </p>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Normal gross</dt>
                  <dd className="font-mono text-zinc-100">
                    {formatCurrency(salary.normalSalary, form.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Extra gross</dt>
                  <dd className="font-mono text-zinc-100">
                    {formatCurrency(salary.extraSalary, form.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Total gross salary</dt>
                  <dd className="font-mono text-zinc-100">
                    {formatCurrency(salary.totalSalary, form.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Travel allowance</dt>
                  <dd className="font-mono text-zinc-100">
                    {formatCurrency(salary.travelAllowance, form.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-800 pt-2 mt-2">
                  <dt className="text-xs uppercase tracking-[0.2em] text-zinc-300">
                    Final day total
                  </dt>
                  <dd className="font-mono text-lg font-semibold text-[#f59e0b]">
                    {formatCurrency(salary.finalTotal, form.currency)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[10px] text-zinc-600">
                Gross salary only — taxes and deductions are not calculated.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Notes
              </Label>
              <Textarea
                id="notes"
                placeholder="Any context for this workday…"
                rows={3}
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-[#f59e0b] resize-none"
              />
            </div>

            <SheetFooter className="mt-4 flex-row flex-wrap gap-2 sm:flex-row sm:justify-between">
              <div>
                {existingLog && (
                  <Button
                    type="button"
                    variant="outline"
                    className="!bg-transparent !hover:bg-transparent border-red-900/50 text-red-500 hover:border-red-500"
                    onClick={handleDelete}
                    disabled={deleting || submitting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deleting ? 'Deleting…' : 'Delete'}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
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
                  ) : existingLog ? (
                    'Update workday'
                  ) : (
                    'Save workday'
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <RatePresetManager
        open={presetManagerOpen}
        onOpenChange={setPresetManagerOpen}
        presets={presets}
        initialEditId={presetEditId}
        onChanged={loadPresets}
      />
    </>
  );
}
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CurrencyCode,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  formatCurrency,
} from '@/lib/currency';
import { RatePreset } from '@/lib/workDayLogs';

interface RatePresetManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: RatePreset[];
  onChanged: () => void;
  initialEditId?: string | null;
}

interface FormState {
  name: string;
  location: string;
  normal_rate: string;
  extra_rate: string;
  kilometer_rate: string;
  currency: CurrencyCode;
}

const empty: FormState = {
  name: '',
  location: '',
  normal_rate: '',
  extra_rate: '',
  kilometer_rate: '',
  currency: DEFAULT_CURRENCY,
};

export function RatePresetManager({
  open,
  onOpenChange,
  presets,
  onChanged,
  initialEditId = null,
}: RatePresetManagerProps) {
  const { user } = useAuth();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (initialEditId) {
      const p = presets.find((pr) => pr.id === initialEditId);
      if (p) loadPresetIntoForm(p);
      else resetForm();
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEditId]);

  const resetForm = () => {
    setEditId(null);
    setForm(empty);
    setErrors({});
  };

  const loadPresetIntoForm = (p: RatePreset) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      location: p.location ?? '',
      normal_rate: String(p.normal_rate ?? ''),
      extra_rate: String(p.extra_rate ?? ''),
      kilometer_rate:
        p.kilometer_rate != null && p.kilometer_rate !== 0 ? String(p.kilometer_rate) : '',
      currency: (p.currency as CurrencyCode) || DEFAULT_CURRENCY,
    });
    setErrors({});
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'Preset name is required';
    const nr = Number(form.normal_rate);
    if (form.normal_rate === '' || Number.isNaN(nr) || nr < 0) {
      next.normal_rate = 'Enter a valid rate';
    }
    const er = Number(form.extra_rate);
    if (form.extra_rate === '' || Number.isNaN(er) || er < 0) {
      next.extra_rate = 'Enter a valid rate';
    }
    if (form.kilometer_rate !== '') {
      const kr = Number(form.kilometer_rate);
      if (Number.isNaN(kr) || kr < 0) next.kilometer_rate = 'Invalid';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSaving(true);

    // Always fetch the current authenticated user from Supabase to ensure
    // we have a valid, fresh user_id that matches the RLS policy.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      setSaving(false);
      toast.error('You must be logged in to save presets');
      return;
    }
    const currentUserId = authData.user.id;

    const payload = {
      user_id: currentUserId,
      name: form.name.trim(),
      location: form.location.trim() || null,
      normal_rate: Number(form.normal_rate),
      extra_rate: Number(form.extra_rate),
      kilometer_rate: form.kilometer_rate === '' ? 0 : Number(form.kilometer_rate),
      currency: form.currency,
    };

    let error;
    if (editId) {
      ({ error } = await supabase
        .from(TABLES.ratePresets)
        .update(payload)
        .eq('id', editId)
        .eq('user_id', currentUserId));
    } else {
      ({ error } = await supabase.from(TABLES.ratePresets).insert(payload));
    }
    setSaving(false);

    if (error) {
      toast.error('Failed to save preset', { description: error.message });
      return;
    }
    toast.success(editId ? 'Preset updated' : 'Preset created');
    resetForm();
    onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this preset?')) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      toast.error('You must be logged in to delete presets');
      return;
    }
    const currentUserId = authData.user.id;
    const { error } = await supabase
      .from(TABLES.ratePresets)
      .delete()
      .eq('id', id)
      .eq('user_id', currentUserId);
    if (error) {
      toast.error('Failed to delete', { description: error.message });
      return;
    }
    toast.success('Preset deleted');
    if (editId === id) resetForm();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[#0a0a0a] border border-zinc-800 text-zinc-100">
        <DialogHeader>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            Salary rate presets
          </p>
          <DialogTitle className="text-zinc-100">Manage your rate presets</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Save the rates you use often so logging a workday is a one-click job.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* List */}
          <div className="border border-zinc-800 bg-zinc-950/50">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Saved presets
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="!bg-transparent !hover:bg-transparent h-7 border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b]"
                onClick={resetForm}
              >
                <Plus className="mr-1 h-3 w-3" /> New
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/80">
              {presets.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-zinc-600">
                  No presets yet. Create your first one →
                </p>
              ) : (
                presets.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-start justify-between gap-2 px-3 py-2.5 ${
                      editId === p.id ? 'bg-zinc-900/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 truncate">{p.name}</p>
                      {p.location && (
                        <p className="text-[11px] text-zinc-500 truncate">{p.location}</p>
                      )}
                      <p className="mt-1 text-[11px] font-mono text-zinc-400">
                        {formatCurrency(p.normal_rate, p.currency as CurrencyCode)} /
                        {formatCurrency(p.extra_rate, p.currency as CurrencyCode)}
                        {p.kilometer_rate ? ` • ${p.kilometer_rate}/km` : ''}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-500 hover:text-[#f59e0b]"
                        onClick={() => loadPresetIntoForm(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-500 hover:text-red-500"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {editId ? 'Edit preset' : 'New preset'}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="p_name" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Name <span className="text-[#f59e0b]">*</span>
              </Label>
              <Input
                id="p_name"
                placeholder="e.g. Fluxys Loenhout"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_loc" className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Work location
              </Label>
              <Input
                id="p_loc"
                placeholder="e.g. Antwerp, BE"
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="p_nr"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
                  Normal rate <span className="text-[#f59e0b]">*</span>
                </Label>
                <Input
                  id="p_nr"
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
              <div className="space-y-1.5">
                <Label
                  htmlFor="p_er"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
                  Extra rate <span className="text-[#f59e0b]">*</span>
                </Label>
                <Input
                  id="p_er"
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="p_km"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
                  Km rate (optional)
                </Label>
                <Input
                  id="p_km"
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
              <div className="space-y-1.5">
                <Label
                  htmlFor="p_cur"
                  className="text-xs uppercase tracking-[0.2em] text-zinc-400"
                >
                  Currency
                </Label>
                <select
                  id="p_cur"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value as CurrencyCode)}
                  className="flex h-9 w-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f59e0b]"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="mt-3 flex-row gap-2 sm:flex-row sm:justify-end">
              {editId && (
                <Button
                  type="button"
                  variant="outline"
                  className="!bg-transparent !hover:bg-transparent border-zinc-800 text-zinc-300 hover:border-zinc-600"
                  onClick={resetForm}
                >
                  Cancel edit
                </Button>
              )}
              <Button
                type="submit"
                className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : editId ? (
                  'Update preset'
                ) : (
                  'Create preset'
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
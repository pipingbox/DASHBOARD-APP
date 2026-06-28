import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, MapPin, Plane, Globe, RotateCcw, Clock, Briefcase, AlertCircle, RefreshCw } from 'lucide-react';
import { withQueryTimeout } from '@/lib/queryTimeout';

const EMPLOYMENT_STATUS_OPTIONS = [
  'currently_employed',
  'unemployed',
  'actively_looking',
  'open_to_offers',
  'not_available',
] as const;

const AVAILABILITY_STATUS_OPTIONS = [
  'available_immediately',
  'available_soon',
  'available_from_date',
  'not_currently_available',
] as const;

const ROTATION_OPTIONS = [
  'local_only',
  'daily_commute',
  'weekly_rotation',
  '2_1_rotation',
  '3_1_rotation',
  '4_2_rotation',
  'flexible',
] as const;

const NOTICE_PERIOD_OPTIONS = [
  'immediate',
  '1_week',
  '2_weeks',
  '1_month',
  'more_than_1_month',
] as const;

export function AvailabilityMobilitySection() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [employmentStatus, setEmploymentStatus] = useState<string>('');
  const [availabilityStatus, setAvailabilityStatus] = useState<string>('');
  const [availableFrom, setAvailableFrom] = useState<string>('');
  const [willingToTravel, setWillingToTravel] = useState(true);
  const [willingToRelocate, setWillingToRelocate] = useState(false);
  const [preferredRegions, setPreferredRegions] = useState<string>('');
  const [rotationPreference, setRotationPreference] = useState<string>('');
  const [noticePeriod, setNoticePeriod] = useState<string>('');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const { data } = await withQueryTimeout(
        supabase
          .from(TABLES.profiles)
          .select(
            'employment_status, availability_status, available_from, willing_to_travel, willing_to_relocate, preferred_regions, rotation_preference, notice_period, location'
          )
          .eq('user_id', user.id)
          .maybeSingle()
      );

      if (data) {
        setEmploymentStatus(data.employment_status || '');
        setAvailabilityStatus(data.availability_status || '');
        setAvailableFrom(data.available_from || '');
        setWillingToTravel(data.willing_to_travel ?? true);
        setWillingToRelocate(data.willing_to_relocate ?? false);
        setPreferredRegions(data.preferred_regions || '');
        setRotationPreference(data.rotation_preference || '');
        setNoticePeriod(data.notice_period || '');
      }
    } catch (err) {
      console.error('[AvailabilityMobility] load error:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from(TABLES.profiles)
        .update({
          employment_status: employmentStatus || null,
          availability_status: availabilityStatus || null,
          available_from: availabilityStatus === 'available_from_date' ? availableFrom || null : null,
          willing_to_travel: willingToTravel,
          willing_to_relocate: willingToRelocate,
          preferred_regions: preferredRegions || null,
          rotation_preference: rotationPreference || null,
          notice_period: noticePeriod || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success(t('availability.saved'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !user) return null;

  if (loading) {
    return (
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{t('common.loadError', 'Could not load data')}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-[#f59e0b] hover:underline"
          >
            <RefreshCw className="h-3 w-3" />
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            {t('availability.title')}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            {t('availability.description')}
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Employment Status */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {t('availability.employmentStatus')}
          </Label>
          <select
            value={employmentStatus}
            onChange={(e) => setEmploymentStatus(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
          >
            <option value="">{t('availability.selectOption')}</option>
            {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`availability.employment.${opt}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Availability Status */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {t('availability.availabilityStatus')}
          </Label>
          <select
            value={availabilityStatus}
            onChange={(e) => setAvailabilityStatus(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
          >
            <option value="">{t('availability.selectOption')}</option>
            {AVAILABILITY_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`availability.status.${opt}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Available From Date - conditional */}
        {availabilityStatus === 'available_from_date' && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              {t('availability.availableFrom')}
            </Label>
            <Input
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
            />
          </div>
        )}

        {/* Notice Period */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {t('availability.noticePeriod')}
          </Label>
          <select
            value={noticePeriod}
            onChange={(e) => setNoticePeriod(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
          >
            <option value="">{t('availability.selectOption')}</option>
            {NOTICE_PERIOD_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`availability.notice.${opt}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Rotation Preference */}
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            {t('availability.rotationPreference')}
          </Label>
          <select
            value={rotationPreference}
            onChange={(e) => setRotationPreference(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
          >
            <option value="">{t('availability.selectOption')}</option>
            {ROTATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`availability.rotation.${opt}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobility Toggles */}
      <div className="border-t border-zinc-800 pt-5 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#f59e0b]" />
          {t('availability.mobilityTitle')}
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-300">{t('availability.willingToTravel')}</span>
          </div>
          <Switch
            checked={willingToTravel}
            onCheckedChange={setWillingToTravel}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-300">{t('availability.willingToRelocate')}</span>
          </div>
          <Switch
            checked={willingToRelocate}
            onCheckedChange={setWillingToRelocate}
          />
        </div>

        {/* Preferred Regions */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-zinc-400">
            {t('availability.preferredRegions')}
          </Label>
          <Input
            value={preferredRegions}
            onChange={(e) => setPreferredRegions(e.target.value)}
            placeholder={t('availability.preferredRegionsPlaceholder')}
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
          />
          <p className="text-[10px] text-zinc-600">
            {t('availability.preferredRegionsHint')}
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? t('common.saving') : t('availability.save')}
        </Button>
      </div>
    </div>
  );
}
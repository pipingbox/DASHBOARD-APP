import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCertExpiryAlerts } from '@/hooks/useCertExpiryAlerts';

export function CertAlertPreferences() {
  const { t } = useTranslation();
  const { prefs, loading, savePrefs } = useCertExpiryAlerts();
  const [daysBeforeExpiry, setDaysBeforeExpiry] = useState(30);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefs) {
      setDaysBeforeExpiry(prefs.days_before_expiry);
      setInAppAlerts(prefs.in_app_alerts);
    }
  }, [prefs]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePrefs({
        days_before_expiry: daysBeforeExpiry,
        in_app_alerts: inAppAlerts,
      });
      toast.success(t('certAlerts.prefsSaved'));
    } catch {
      toast.error(t('certAlerts.prefsError'));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-[#f59e0b]" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
            {t('certAlerts.sectionLabel')}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold">{t('certAlerts.title')}</h2>
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-500">{t('certAlerts.description')}</p>

      <div className="mt-5 space-y-4">
        {/* Days before expiry */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
          <label
            htmlFor="days-before"
            className="text-sm font-medium text-zinc-300"
          >
            {t('certAlerts.daysBefore')}
          </label>
          <select
            id="days-before"
            value={daysBeforeExpiry}
            onChange={(e) => setDaysBeforeExpiry(Number(e.target.value))}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 sm:w-auto"
          >
            <option value={7}>7 {t('certAlerts.days')}</option>
            <option value={14}>14 {t('certAlerts.days')}</option>
            <option value={30}>30 {t('certAlerts.days')}</option>
            <option value={60}>60 {t('certAlerts.days')}</option>
            <option value={90}>90 {t('certAlerts.days')}</option>
          </select>
        </div>

        {/* In-app alerts toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="in-app-alerts"
            checked={inAppAlerts}
            onChange={(e) => setInAppAlerts(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-[#f59e0b] focus:ring-[#f59e0b]"
          />
          <label htmlFor="in-app-alerts" className="text-sm text-zinc-300">
            {t('certAlerts.inAppToggle')}
          </label>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-[#f59e0b] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-[#d97706] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {t('certAlerts.saveButton')}
        </button>
      </div>
    </section>
  );
}
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Seccion de Job & Matching Preferences en /profile.
 * Consentimientos independientes por canal y categoria.
 * PB-MATCHING-NOTIFICATIONS-001
 */
export function ProfileMatchingPreferencesSection() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobMatching, setJobMatching] = useState(true);
  const [workforceInvitations, setWorkforceInvitations] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [whatsappAlerts, setWhatsappAlerts] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from(TABLES.matchingPreferences)
        .select('job_matching_enabled, workforce_invitations_enabled, email_job_alerts, whatsapp_job_alerts')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setJobMatching(data.job_matching_enabled ?? true);
        setWorkforceInvitations(data.workforce_invitations_enabled ?? true);
        setEmailAlerts(data.email_job_alerts ?? false);
        setWhatsappAlerts(data.whatsapp_job_alerts ?? false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from(TABLES.matchingPreferences)
        .upsert(
          {
            user_id: user.id,
            job_matching_enabled: jobMatching,
            workforce_invitations_enabled: workforceInvitations,
            email_job_alerts: emailAlerts,
            whatsapp_job_alerts: whatsappAlerts,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      if (error) throw error;
      toast.success(t('profile.matchingPreferencesSaved', 'Preferences saved'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.saveError', 'Save error');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          {t('profile.matchingPreferencesTitle', 'Job & Matching Preferences')}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          {t(
            'profile.matchingPreferencesHint',
            'Choose which opportunities you want to receive and through which channels. Each consent is independent.',
          )}
        </p>
      </div>

      <div className="space-y-4">
        <PreferenceRow
          label={t('profile.jobMatchingEnabled', 'Job matching')}
          description={t('profile.jobMatchingEnabledHint', 'Receive opportunities from published jobs')}
          checked={jobMatching}
          onCheckedChange={setJobMatching}
        />
        <PreferenceRow
          label={t('profile.workforceInvitationsEnabled', 'Workforce invitations')}
          description={t('profile.workforceInvitationsEnabledHint', 'Receive invitations to PipingBox-managed projects')}
          checked={workforceInvitations}
          onCheckedChange={setWorkforceInvitations}
        />
        <PreferenceRow
          label={t('profile.emailJobAlerts', 'Email alerts')}
          description={t('profile.emailJobAlertsHint', 'Send matching opportunities by email')}
          checked={emailAlerts}
          onCheckedChange={setEmailAlerts}
        />
        <PreferenceRow
          label={t('profile.whatsappJobAlerts', 'WhatsApp alerts')}
          description={t('profile.whatsappJobAlertsHint', 'Send matching opportunities by WhatsApp')}
          checked={whatsappAlerts}
          onCheckedChange={setWhatsappAlerts}
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('common.saving', 'Saving...')}
          </>
        ) : (
          t('profile.saveMatchingPreferences', 'Save preferences')
        )}
      </Button>
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm text-zinc-200">{label}</Label>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-[#f59e0b]"
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { COUNTRY_PHONE_OPTIONS, normalizeToE164 } from '@/lib/phone';
import { supabase, TABLES } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfilePhoneSection() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const [countryCode, setCountryCode] = useState('ES');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!profile?.phone_e164) return;
    const country = COUNTRY_PHONE_OPTIONS.find((option) => option.code === profile.phone_country_code);
    if (country) {
      setCountryCode(country.code);
      setNumber(profile.phone_e164.slice(country.prefix.length + 1));
    }
  }, [profile?.phone_e164, profile?.phone_country_code]);

  const save = async (remove = false) => {
    if (!user || saving) return;
    const normalized = remove ? null : normalizeToE164(countryCode, number);
    if (!remove && (!normalized?.valid || !normalized.e164)) {
      toast.error(t('profile.phoneInvalid'));
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.profiles)
        .update({
          phone_e164: normalized ? `+${normalized.e164}` : null,
          phone_country_code: normalized ? countryCode : null,
        })
        .eq('user_id', user.id)
        .select('user_id')
        .single();
      if (error || !data) throw error ?? new Error('profile_not_found');
      await refreshProfile();
      setEditing(false);
      if (remove) setNumber('');
      toast.success(t(remove ? 'profile.phoneContactRemoved' : 'profile.phoneSaved'));
    } catch {
      toast.error(t('common.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (!user || !profile || profile.role === 'company') return null;
  const selectedCountry = COUNTRY_PHONE_OPTIONS.find((option) => option.code === countryCode) ?? COUNTRY_PHONE_OPTIONS[0];
  const hasPhone = Boolean(profile.phone_e164);

  return (
    <section className="space-y-4 border border-amber-500/30 bg-[#0d0d0d] p-5" aria-label={t('profile.phoneNumber')}>
      <div className="flex items-start gap-3">
        <Phone className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{t('profile.phoneOptionalTitle')}</h3>
          <p className="mt-1 text-xs text-zinc-400">{t('profile.phoneRecommended')}</p>
          <p className="mt-1 text-xs text-zinc-500">{t('profile.phonePrivate')}</p>
        </div>
      </div>
      {hasPhone && !editing ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-200">
          <span>{profile.phone_e164}</span>
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            {t('profile.phoneEdit')}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save(true)}>
            {t('profile.phoneRemove')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div>
              <Label htmlFor="profile-phone-country">{t('profile.country')}</Label>
              <select
                id="profile-phone-country"
                className="mt-1 h-11 w-full border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                value={countryCode}
                onChange={(event) => { setCountryCode(event.target.value); setNumber(''); }}
              >
                {COUNTRY_PHONE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.code} (+{option.prefix})</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="profile-phone-number">{t('profile.phoneNumber')}</Label>
              <div className="mt-1 flex items-center border border-zinc-700 bg-zinc-950">
                <span className="px-3 text-sm text-zinc-400">+{selectedCountry.prefix}</span>
                <Input
                  id="profile-phone-number"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="tel"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  className="h-11 min-w-0 border-0 bg-transparent text-zinc-100"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={saving} onClick={() => void save()}>{t('profile.phoneSave')}</Button>
            {editing && <Button type="button" variant="outline" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>}
          </div>
        </div>
      )}
    </section>
  );
}

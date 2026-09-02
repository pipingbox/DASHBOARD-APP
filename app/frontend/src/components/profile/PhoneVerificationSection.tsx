import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle2, Phone, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { edgeFunctionUrl } from '@/lib/supabase';
import { COUNTRY_PHONE_OPTIONS, normalizeToE164 } from '@/lib/phone';

const COUNTRY_OPTIONS = COUNTRY_PHONE_OPTIONS.map((c) => ({
  code: c.code,
  name: `${c.code === 'ES' ? 'Spain' : c.code === 'BE' ? 'Belgium' : c.code === 'NL' ? 'Netherlands' : c.code === 'DE' ? 'Germany' : c.code === 'FR' ? 'France' : c.code === 'PT' ? 'Portugal' : c.code === 'IT' ? 'Italy' : c.code === 'GB' ? 'United Kingdom' : c.code === 'PL' ? 'Poland' : 'Romania'} (+${c.prefix})`,
  prefix: c.prefix,
}));

/**
 * Seccion de verificacion de telefono E.164 + OTP en /profile.
 * PB-PHONE-VERIFICATION-001
 */
export function PhoneVerificationSection() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [countryCode, setCountryCode] = useState('ES');
  const [nationalNumber, setNationalNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

  const verified = Boolean(profile?.phone_verified_at);
  const phoneE164 = profile?.phone_e164;

  useEffect(() => {
    if (!profile) return;
    setLoading(false);
    const country = COUNTRY_OPTIONS.find((c) => c.code === profile.phone_country_code);
    if (country) setCountryCode(country.code);
  }, [profile]);

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === countryCode) || COUNTRY_OPTIONS[0];

  const handleSendOtp = async () => {
    if (!user) return;
    const normalized = normalizeToE164(countryCode, nationalNumber);
    if (!normalized.valid || !normalized.e164) {
      toast.error(t('profile.phoneInvalid', 'Please enter a valid phone number'));
      return;
    }
    const phone = normalized.e164;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No session');

      const res = await fetch(edgeFunctionUrl('phone-send-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ phone_e164: phone, country_code: countryCode }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Send failed');

      toast.success(t('profile.otpSent', 'Verification code sent'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('profile.otpSendFailed', 'Failed to send code');
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!user) return;
    if (otp.length !== 6) {
      toast.error(t('profile.otpInvalid', 'Enter the 6-digit code'));
      return;
    }
    setVerifying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No session');

      const res = await fetch(edgeFunctionUrl('phone-verify-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code: otp, whatsapp_opt_in: whatsappOptIn }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Verify failed');

      toast.success(t('profile.phoneVerified', 'Phone verified'));
      await refreshProfile();
      setOtp('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('profile.otpVerifyFailed', 'Failed to verify code');
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from(TABLES.profiles)
        .update({
          phone_e164: null,
          phone_country_code: null,
          phone_verified_at: null,
          whatsapp_opt_in: false,
          whatsapp_opt_in_at: null,
          whatsapp_opt_in_source: null,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      await refreshProfile();
      toast.success(t('profile.phoneRemoved', 'Phone and consent removed'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.saveError', 'Save error');
      toast.error(msg);
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
      <div className="flex items-start gap-3">
        <Phone className="mt-0.5 h-5 w-5 text-zinc-400" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            {t('profile.phoneVerificationTitle', 'Phone Verification')}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {t(
              'profile.phoneVerificationHint',
              'Add an international phone number and verify it with an SMS code. Required for WhatsApp alerts.',
            )}
          </p>
        </div>
      </div>

      {!verified && (
        <div className="flex items-start gap-3 border border-amber-900/30 bg-amber-950/20 p-3 text-amber-200">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200/80">
            {t(
              'profile.whatsappBanner',
              'Receive opportunities by WhatsApp. Include the international prefix and verify your number to avoid delivery failures.',
            )}
          </p>
        </div>
      )}

      {verified ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {t('profile.phoneVerifiedLabel', 'Verified')}: {phoneE164}
            </span>
          </div>
          <PreferenceRow
            label={t('profile.whatsappOptIn', 'WhatsApp job alerts')}
            description={t('profile.whatsappOptInHint', 'Allow PipingBox to contact me via WhatsApp')}
            checked={profile?.whatsapp_opt_in ?? false}
            onCheckedChange={async (value) => {
              if (!user) return;
              await supabase
                .from(TABLES.profiles)
                .update({
                  whatsapp_opt_in: value,
                  whatsapp_opt_in_at: value ? new Date().toISOString() : null,
                  whatsapp_opt_in_source: value ? 'profile_settings' : null,
                })
                .eq('user_id', user.id);
              await refreshProfile();
            }}
          />
          <Button
            variant="outline"
            onClick={handleWithdrawConsent}
            className="border-zinc-700 text-zinc-300 hover:text-white"
          >
            {t('profile.removePhone', 'Remove phone / withdraw consent')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.country', 'Country')}
              </Label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="h-10 w-full bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#f59e0b]"
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.phoneNumber', 'Phone number')}
              </Label>
              <div className="flex">
                <span className="flex items-center border border-r-0 border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-500">
                  +{selectedCountry.prefix}
                </span>
                <Input
                  value={nationalNumber}
                  onChange={(e) => setNationalNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('profile.phonePlaceholder', '612 345 678')}
                  className="rounded-l-none bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
                />
              </div>
            </div>
          </div>

          <PreferenceRow
            label={t('profile.whatsappOptIn', 'WhatsApp job alerts')}
            description={t('profile.whatsappOptInHint', 'Allow PipingBox to contact me via WhatsApp')}
            checked={whatsappOptIn}
            onCheckedChange={setWhatsappOptIn}
          />

          <Button
            onClick={handleSendOtp}
            disabled={sending}
            className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('profile.sendingOtp', 'Sending...')}
              </>
            ) : (
              t('profile.sendOtp', 'Send verification code')
            )}
          </Button>

          <div className="grid gap-4 sm:grid-cols-[200px_1fr] items-end">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.otpCode', 'Verification code')}
              </Label>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
            </div>
            <Button
              onClick={handleVerifyOtp}
              disabled={verifying || otp.length !== 6}
              variant="outline"
              className="border-zinc-700 text-zinc-200 hover:text-[#f59e0b] hover:border-[#f59e0b]"
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('profile.verifying', 'Verifying...')}
                </>
              ) : (
                t('profile.verifyOtp', 'Verify')
              )}
            </Button>
          </div>
        </div>
      )}
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

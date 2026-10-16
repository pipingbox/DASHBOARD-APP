import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle2, Phone, Shield, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { edgeFunctionUrl } from '@/lib/supabase';
import { COUNTRY_PHONE_OPTIONS, COUNTRY_PHONE_METADATA, normalizeToE164, formatE164ForDisplay } from '@/lib/phone';
import { trackEvent, PHONE_VERIFICATION_ERROR_CATEGORIES } from '@/lib/observability';

const PHONE_VERIFICATION_ENABLED =
  import.meta.env.VITE_PHONE_VERIFICATION_ENABLED === 'true';

type PhoneErrorCategory = (typeof PHONE_VERIFICATION_ERROR_CATEGORIES)[number];

/** Map backend error codes to the closed analytics taxonomy (no PII). */
function toErrorCategory(code: string): PhoneErrorCategory {
  switch (code) {
    case 'invalid_code':
      return 'invalid_code';
    case 'code_expired':
      return 'code_expired';
    case 'max_attempts_exceeded':
      return 'max_attempts';
    case 'rate_limit_exceeded':
      return 'rate_limited';
    case 'resend_cooldown':
      return 'resend_cooldown';
    case 'sms_provider_not_configured':
      return 'provider_unavailable';
    case 'no_pending_verification':
      return 'no_pending';
    case 'phone_not_verified':
      return 'not_verified';
    default:
      return code.startsWith('invalid_') ? 'invalid_phone' : 'unknown';
  }
}

const COUNTRY_OPTIONS = COUNTRY_PHONE_OPTIONS.map((c) => ({
  code: c.code,
  name: `${c.code === 'ES' ? 'Spain' : c.code === 'BE' ? 'Belgium' : c.code === 'NL' ? 'Netherlands' : c.code === 'DE' ? 'Germany' : c.code === 'FR' ? 'France' : c.code === 'PT' ? 'Portugal' : c.code === 'IT' ? 'Italy' : c.code === 'GB' ? 'United Kingdom' : c.code === 'PL' ? 'Poland' : 'Romania'} (+${c.prefix})`,
  prefix: c.prefix,
}));

/**
 * Seccion de telefono + verificacion OTP + consentimiento WhatsApp en /profile.
 * PB-WHATSAPP-FOUNDATION-001
 *
 * Estados separados (ticket §1): phone_present != phone_verified != opt-in.
 * phone_*/whatsapp_* son backend-controlled: el frontend SOLO llama a las
 * Edge Functions phone-send-otp, phone-verify-otp, phone-update-consent y
 * phone-withdraw-consent; nunca escribe esas columnas por PostgREST.
 */
export function PhoneVerificationSection() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();

  const [countryCode, setCountryCode] = useState('ES');
  const [nationalNumber, setNationalNumber] = useState('');
  const [editingNumber, setEditingNumber] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const phonePresent = Boolean(profile?.phone_present ?? profile?.phone_e164);
  const verified = Boolean(profile?.phone_verified ?? profile?.phone_verified_at);
  const phoneE164 = profile?.phone_e164 ?? null;

  useEffect(() => {
    if (!profile) return;
    const country = COUNTRY_OPTIONS.find((c) => c.code === profile.phone_country_code);
    if (country) setCountryCode(country.code);
  }, [profile]);

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) setCooldownUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === countryCode) || COUNTRY_OPTIONS[0];

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('No session');
    return accessToken;
  };

  const callFunction = async (slug: string, payload?: Record<string, unknown>) => {
    const accessToken = await getAccessToken();
    const res = await fetch(edgeFunctionUrl(slug), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(result.error || 'request_failed') as Error & { code?: string };
      err.code = result.error || 'request_failed';
      throw err;
    }
    return result;
  };

  const startCooldown = (seconds: number) => {
    setCooldownUntil(Date.now() + seconds * 1000);
  };

  const handleSendOtp = async () => {
    if (!user || !PHONE_VERIFICATION_ENABLED) return;
    const normalized = normalizeToE164(countryCode, nationalNumber);
    if (!normalized.valid || !normalized.e164) {
      toast.error(t('profile.phoneInvalid', 'Please enter a valid phone number'));
      trackEvent('phone_verification_failed', { error_category: 'invalid_phone' });
      return;
    }
    setSending(true);
    try {
      const result = await callFunction('phone-send-otp', {
        phone: nationalNumber,
        country_code: countryCode,
      });
      const isNew = !phonePresent;
      if (isNew) trackEvent('phone_added');
      trackEvent('phone_verification_started');
      toast.success(t('profile.otpSent', 'Verification code sent'));
      if (typeof result.cooldown_seconds === 'number') startCooldown(result.cooldown_seconds);
      setEditingNumber(false);
      setNationalNumber('');
      await refreshProfile();
    } catch (err) {
      const code = (err as Error & { code?: string }).code || 'unknown';
      trackEvent('phone_verification_failed', { error_category: toErrorCategory(code) });
      if (code === 'sms_provider_not_configured') {
        toast.error(t('profile.phoneVerificationDisabled', 'Phone verification is not enabled yet. We will notify you when WhatsApp alerts become available.'));
      } else {
        toast.error(t('profile.otpSendFailed', 'Failed to send code'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!user || !PHONE_VERIFICATION_ENABLED) return;
    if (otp.length !== 6) {
      toast.error(t('profile.otpInvalid', 'Enter the 6-digit code'));
      return;
    }
    setVerifying(true);
    try {
      await callFunction('phone-verify-otp', { code: otp });
      trackEvent('phone_verification_completed');
      toast.success(t('profile.phoneVerified', 'Phone verified'));
      await refreshProfile();
      setOtp('');
    } catch (err) {
      const code = (err as Error & { code?: string }).code || 'unknown';
      trackEvent('phone_verification_failed', { error_category: toErrorCategory(code) });
      toast.error(t('profile.otpVerifyFailed', 'Failed to verify code'));
    } finally {
      setVerifying(false);
    }
  };

  const handleConsentToggle = async (
    scope: 'service' | 'job_alerts' | 'marketing',
    value: boolean,
  ) => {
    if (!user || consentBusy) return;
    if (value && !verified) {
      toast.error(t('profile.verifyPhoneFirst', 'Verify your phone first'));
      return;
    }
    setConsentBusy(true);
    try {
      const payload: Record<string, boolean> = {};
      if (scope === 'service') payload.service_opt_in = value;
      if (scope === 'job_alerts') payload.job_alerts_opt_in = value;
      if (scope === 'marketing') payload.marketing_opt_in = value;
      await callFunction('phone-update-consent', payload);

      if (scope === 'job_alerts') trackEvent('whatsapp_jobs_opt_in', { value });
      if (scope === 'marketing') trackEvent('whatsapp_marketing_opt_in', { value });

      const hadAny = Boolean(
        profile?.whatsapp_service_opt_in ||
          profile?.whatsapp_job_alerts_opt_in ||
          profile?.whatsapp_marketing_opt_in,
      );
      const stillAny =
        (scope === 'service' ? value : profile?.whatsapp_service_opt_in) ||
        (scope === 'job_alerts' ? value : profile?.whatsapp_job_alerts_opt_in) ||
        (scope === 'marketing' ? value : profile?.whatsapp_marketing_opt_in);
      if (hadAny && !stillAny) trackEvent('whatsapp_opt_out');

      await refreshProfile();
    } catch (err) {
      const code = (err as Error & { code?: string }).code || 'unknown';
      if (code === 'phone_not_verified') {
        toast.error(t('profile.verifyPhoneFirst', 'Verify your phone first'));
      } else {
        toast.error(t('common.saveError', 'Save error'));
      }
    } finally {
      setConsentBusy(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (!user || !PHONE_VERIFICATION_ENABLED) return;
    const hadAny = Boolean(
      profile?.whatsapp_service_opt_in ||
        profile?.whatsapp_job_alerts_opt_in ||
        profile?.whatsapp_marketing_opt_in,
    );
    try {
      await callFunction('phone-withdraw-consent');
      if (hadAny) trackEvent('whatsapp_opt_out');
      await refreshProfile();
      toast.success(t('profile.phoneRemoved', 'Phone and consent removed'));
    } catch {
      toast.error(t('common.saveError', 'Save error'));
    }
  };

  if (!PHONE_VERIFICATION_ENABLED) {
    return (
      <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Phone className="mt-0.5 h-5 w-5 text-zinc-400" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              {t('profile.phoneVerificationTitle', 'Phone Verification')}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {t(
                'profile.phoneVerificationDisabled',
                'Phone verification is not enabled yet. We will notify you when WhatsApp alerts become available.',
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const showNumberForm = !phonePresent || editingNumber;

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

      {/* Estado 1: sin telefono -> Add your phone number */}
      {showNumberForm && (
        <div className="space-y-4">
          {!phonePresent && (
            <p className="text-sm text-zinc-300">
              {t('profile.phoneAddCta', 'Add your phone number')}
            </p>
          )}
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

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSendOtp}
              disabled={sending || cooldownLeft > 0}
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>{t('profile.sendingOtp', 'Sending...')}</span>
                </>
              ) : cooldownLeft > 0 ? (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  <span>{t('profile.otpResendWait', 'Resend available in {{seconds}}s', { seconds: cooldownLeft })}</span>
                </>
              ) : (
                <span>
                  {phonePresent
                    ? t('profile.otpResend', 'Resend code')
                    : t('profile.sendOtp', 'Send verification code')}
                </span>
              )}
            </Button>
            {editingNumber && (
              <Button
                variant="outline"
                onClick={() => setEditingNumber(false)}
                className="border-zinc-700 text-zinc-300 hover:text-white"
              >
                {t('common.cancel', 'Cancel')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Estado 2: telefono anadido, verificacion pendiente */}
      {phonePresent && !verified && !showNumberForm && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 border border-amber-900/30 bg-amber-950/20 p-3 text-amber-200">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-200/80">
              {t('profile.phonePendingLabel', 'Phone added — verification pending')}:{' '}
              {phoneE164 ? formatE164ForDisplay(phoneE164, countryCode) : ''}
            </p>
          </div>

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
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>{t('profile.verifying', 'Verifying...')}</span>
                </>
              ) : (
                <span>{t('profile.phoneVerifyCta', 'Verify phone')}</span>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                // Pre-rellena con el numero actual: reenviar con el MISMO
                // numero no invalida la verificacion; cambiarlo si (ticket §7).
                if (phoneE164) {
                  const meta = COUNTRY_PHONE_METADATA[countryCode];
                  const digits = phoneE164.replace(/\D/g, '');
                  setNationalNumber(meta && digits.startsWith(meta.prefix) ? digits.slice(meta.prefix.length) : digits);
                }
                setEditingNumber(true);
              }}
              className="text-xs text-zinc-400 underline hover:text-zinc-200"
            >
              {t('profile.phoneChangeNumber', 'Change number / resend code')}
            </button>
            <button
              type="button"
              onClick={handleWithdrawConsent}
              className="text-xs text-zinc-500 underline hover:text-zinc-300"
            >
              {t('profile.removePhone', 'Remove phone / withdraw consent')}
            </button>
          </div>
        </div>
      )}

      {/* Estado 3: telefono verificado + consentimiento WhatsApp por finalidad */}
      {verified && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {t('profile.phoneVerifiedTitle', 'Verified phone')}:{' '}
              {phoneE164 ? formatE164ForDisplay(phoneE164, countryCode) : ''}
            </span>
          </div>

          <div className="border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                {t('profile.whatsappSectionTitle', 'WhatsApp')}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t(
                  'profile.whatsappLead',
                  'Receive job opportunities and important updates by WhatsApp',
                )}
              </p>
              <p className="mt-1 text-xs text-zinc-500 italic">
                {t('profile.whatsappComingSoon', 'WhatsApp notifications will be available soon.')}
              </p>
            </div>

            <PreferenceRow
              label={t('profile.whatsappJobAlerts', 'WhatsApp alerts')}
              description={t('profile.whatsappJobAlertsHint', 'Send matching opportunities by WhatsApp')}
              checked={profile?.whatsapp_job_alerts_opt_in ?? false}
              disabled={consentBusy}
              onCheckedChange={(v) => handleConsentToggle('job_alerts', v)}
            />
            <PreferenceRow
              label={t('profile.whatsappService', 'Service notifications')}
              description={t(
                'profile.whatsappServiceHint',
                'Important updates about your account and applications',
              )}
              checked={profile?.whatsapp_service_opt_in ?? false}
              disabled={consentBusy}
              onCheckedChange={(v) => handleConsentToggle('service', v)}
            />
            <PreferenceRow
              label={t('profile.whatsappMarketing', 'Marketing')}
              description={t('profile.whatsappMarketingHint', 'News, offers and product updates')}
              checked={profile?.whatsapp_marketing_opt_in ?? false}
              disabled={consentBusy}
              onCheckedChange={(v) => handleConsentToggle('marketing', v)}
            />
          </div>

          <Button
            variant="outline"
            onClick={handleWithdrawConsent}
            className="border-zinc-700 text-zinc-300 hover:text-white"
          >
            {t('profile.removePhone', 'Remove phone / withdraw consent')}
          </Button>
        </div>
      )}
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
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
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-[#f59e0b]"
      />
    </div>
  );
}

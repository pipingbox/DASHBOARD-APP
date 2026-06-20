import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, X, Upload, Globe, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateOnboardingCompletion } from '@/lib/profileCompletion';

// Industry-standard role names — kept in English as DB values
const ROLES = [
  'Piping Supervisor',
  'Pipefitter',
  'Welder',
  'Mechanical Supervisor',
  'QA/QC',
  'HSE',
  'Rigger',
  'Scaffolder',
  'Engineer',
  'Other',
];

const SPECIALTIES = [
  'Piping',
  'Mechanical',
  'Welding',
  'Rigging',
  'Scaffolding',
  'QA/QC',
  'HSE',
  'Shutdowns',
  'Oil & Gas',
  'Energy',
  'Construction',
];

const TOTAL_STEPS = 8;

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form state
  const [accountType, setAccountType] = useState<'worker' | 'company'>('worker');
  const [mainRole, setMainRole] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [availability, setAvailability] = useState('');
  const [willingToTravel, setWillingToTravel] = useState(false);
  const [willingToRelocate, setWillingToRelocate] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'private'>('public');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const accountTypes = [
    { value: 'worker' as const, label: t('onboarding.accountWorker'), icon: '🔧' },
    { value: 'company' as const, label: t('onboarding.accountCompany'), icon: '🏢' },
  ];

  const availabilityOptions = [
    { value: 'available', label: t('onboarding.availableNow') },
    { value: 'in_2_weeks', label: t('onboarding.availableIn2Weeks') },
    { value: 'in_1_month', label: t('onboarding.availableIn1Month') },
    { value: 'working', label: t('onboarding.currentlyWorking') },
    { value: 'not_available', label: t('onboarding.notAvailable') },
  ];

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const saveStepProgress = useCallback(async (updates: Record<string, unknown>) => {
    if (!user) return;
    try {
      const completion = calculateOnboardingCompletion({
        accountType,
        mainRole,
        specialties,
        country,
        city,
        availability,
        willingToTravel,
        willingToRelocate,
        profileVisibility,
        hasAvatar: !!avatarPreview,
        fullName: profile?.full_name || undefined,
      });
      await supabase
        .from(TABLES.profiles)
        .update({ ...updates, profile_completion: completion })
        .eq('user_id', user.id);
    } catch (err) {
      console.error('[Onboarding] Step save error:', err);
    }
  }, [user, accountType, mainRole, specialties, country, city, availability, willingToTravel, willingToRelocate, profileVisibility, avatarPreview, profile?.full_name]);

  const saveAndFinish = async () => {
    if (!user) return;
    setSaving(true);

    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKETS.avatars)
          .upload(path, avatarFile, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKETS.avatars)
            .getPublicUrl(path);
          avatarUrl = urlData.publicUrl;
        }
      }

      const completion = calculateOnboardingCompletion({
        accountType,
        mainRole,
        specialties,
        country,
        city,
        availability,
        willingToTravel,
        willingToRelocate,
        profileVisibility,
        hasAvatar: !!avatarUrl || !!avatarPreview,
        fullName: profile?.full_name || undefined,
      });

      const updates: Record<string, unknown> = {
        account_type: accountType,
        role: accountType === 'company' ? 'company' : 'worker',
        title: mainRole || null,
        skills: specialties,
        location: [city, country].filter(Boolean).join(', ') || null,
        availability_status: availability || 'not_specified',
        willing_to_travel: willingToTravel,
        willing_to_relocate: willingToRelocate,
        cv_visible: profileVisibility === 'public',
        profile_visibility: profileVisibility,
        profile_completion: completion,
        onboarding_completed: true,
      };

      if (avatarUrl) {
        updates.avatar_url = avatarUrl;
      }

      const { error } = await supabase
        .from(TABLES.profiles)
        .update(updates)
        .eq('user_id', user.id);

      if (error) {
        console.error('[Onboarding] Final save error:', error.message);
      }

      await refreshProfile();
      onComplete();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[Onboarding] Error:', err);
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return true;
      case 2: return !!mainRole;
      case 3: return specialties.length > 0;
      case 4: return !!(country || city);
      case 5: return !!availability;
      case 6: return true;
      case 7: return !!profileVisibility;
      case 8: return true;
      default: return true;
    }
  };

  const nextStep = async () => {
    if (step < TOTAL_STEPS) {
      const stepUpdates = getStepUpdates(step);
      if (stepUpdates && Object.keys(stepUpdates).length > 0) {
        await saveStepProgress(stepUpdates);
      }
      setStep(step + 1);
    } else {
      await saveAndFinish();
    }
  };

  const getStepUpdates = (currentStep: number): Record<string, unknown> | null => {
    switch (currentStep) {
      case 1:
        return { account_type: accountType, role: accountType === 'company' ? 'company' : 'worker' };
      case 2:
        return { title: mainRole };
      case 3:
        return { skills: specialties };
      case 4:
        return { location: [city, country].filter(Boolean).join(', ') || null };
      case 5:
        return { availability_status: availability || 'not_specified' };
      case 6:
        return { willing_to_travel: willingToTravel, willing_to_relocate: willingToRelocate };
      case 7:
        return { cv_visible: profileVisibility === 'public', profile_visibility: profileVisibility };
      default:
        return null;
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const skipOnboarding = async () => {
    if (!user) return;
    await supabase
      .from(TABLES.profiles)
      .update({
        onboarding_completed: true,
        profile_visibility: 'public',
        cv_visible: true,
      })
      .eq('user_id', user.id);
    await refreshProfile();
    onComplete();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a] p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-zinc-100 sm:text-2xl">
            {t('onboarding.title')}
          </h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            {t('onboarding.subtitle')}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {t('onboarding.stepOf', { current: step, total: TOTAL_STEPS })}
            </span>
            <span className="text-[10px] font-semibold text-[#f59e0b]">
              {t('onboarding.percentComplete', { percent: progress })}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-5 sm:p-6 min-h-[300px] flex flex-col">
          <div className="flex-1">
            {/* Step 1: Account Type */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step1Title')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {accountTypes.map((at) => (
                    <button
                      key={at.value}
                      onClick={() => setAccountType(at.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-4 transition',
                        accountType === at.value
                          ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                      )}
                    >
                      <span className="text-2xl" aria-hidden="true">{at.icon}</span>
                      <span className="text-xs font-medium">{at.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Main Role */}
            {step === 2 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step2Title')}</h2>
                <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setMainRole(r)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-xs font-medium transition text-left',
                        mainRole === r
                          ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Specialties */}
            {step === 3 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step3Title')}</h2>
                <p className="text-[10px] text-zinc-500">{t('onboarding.step3Hint')}</p>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSpecialty(s)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        specialties.includes(s)
                          ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                      )}
                    >
                      {specialties.includes(s) && <Check className="inline h-3 w-3 mr-1" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Location */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step4Title')}</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">{t('onboarding.country')}</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder={t('onboarding.countryPlaceholder')}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">{t('onboarding.cityRegion')}</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={t('onboarding.cityPlaceholder')}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Availability */}
            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step5Title')}</h2>
                <div className="space-y-2">
                  {availabilityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAvailability(opt.value)}
                      className={cn(
                        'w-full rounded-md border px-4 py-2.5 text-left text-sm font-medium transition',
                        availability === opt.value
                          ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 6: Travel / Relocation */}
            {step === 6 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step6Title')}</h2>
                <p className="text-xs text-zinc-500">{t('onboarding.step6Subtitle')}</p>
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer rounded-md border border-zinc-700 bg-zinc-900 p-4 transition hover:border-zinc-600">
                    <input
                      type="checkbox"
                      checked={willingToTravel}
                      onChange={(e) => setWillingToTravel(e.target.checked)}
                      className="h-5 w-5 rounded border-zinc-600 bg-zinc-800 text-[#f59e0b] focus:ring-[#f59e0b]"
                    />
                    <div>
                      <span className="text-sm font-medium text-zinc-200">{t('onboarding.willingToTravel')}</span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{t('onboarding.willingToTravelDesc')}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer rounded-md border border-zinc-700 bg-zinc-900 p-4 transition hover:border-zinc-600">
                    <input
                      type="checkbox"
                      checked={willingToRelocate}
                      onChange={(e) => setWillingToRelocate(e.target.checked)}
                      className="h-5 w-5 rounded border-zinc-600 bg-zinc-800 text-[#f59e0b] focus:ring-[#f59e0b]"
                    />
                    <div>
                      <span className="text-sm font-medium text-zinc-200">{t('onboarding.willingToRelocate')}</span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{t('onboarding.willingToRelocateDesc')}</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Step 7: Profile Visibility */}
            {step === 7 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step7Title')}</h2>
                <p className="text-xs text-zinc-500">{t('onboarding.step7Subtitle')}</p>
                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setProfileVisibility('public')}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-lg border p-4 text-left transition',
                      profileVisibility === 'public'
                        ? 'border-[#f59e0b] bg-[#f59e0b]/10'
                        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                    )}
                  >
                    <Globe className={cn('h-5 w-5 mt-0.5 shrink-0', profileVisibility === 'public' ? 'text-[#f59e0b]' : 'text-zinc-500')} />
                    <div>
                      <span className={cn('text-sm font-semibold', profileVisibility === 'public' ? 'text-[#f59e0b]' : 'text-zinc-300')}>
                        {t('onboarding.publicProfile')}
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {t('onboarding.publicProfileDesc')}
                      </p>
                    </div>
                    {profileVisibility === 'public' && (
                      <Check className="h-4 w-4 text-[#f59e0b] shrink-0 ml-auto mt-0.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setProfileVisibility('private')}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-lg border p-4 text-left transition',
                      profileVisibility === 'private'
                        ? 'border-[#f59e0b] bg-[#f59e0b]/10'
                        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                    )}
                  >
                    <Lock className={cn('h-5 w-5 mt-0.5 shrink-0', profileVisibility === 'private' ? 'text-[#f59e0b]' : 'text-zinc-500')} />
                    <div>
                      <span className={cn('text-sm font-semibold', profileVisibility === 'private' ? 'text-[#f59e0b]' : 'text-zinc-300')}>
                        {t('onboarding.privateProfile')}
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {t('onboarding.privateProfileDesc')}
                      </p>
                    </div>
                    {profileVisibility === 'private' && (
                      <Check className="h-4 w-4 text-[#f59e0b] shrink-0 ml-auto mt-0.5" />
                    )}
                  </button>
                </div>
                <div className="rounded-md bg-zinc-900/50 border border-zinc-800 p-3 mt-2">
                  <p className="text-[10px] text-zinc-500">
                    {t('onboarding.visibilityTip')}
                  </p>
                </div>
              </div>
            )}

            {/* Step 8: Photo */}
            {step === 8 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">{t('onboarding.step8Title')}</h2>
                <p className="text-xs text-zinc-500">{t('onboarding.step8Subtitle')}</p>
                <div className="flex flex-col items-center gap-4 pt-2">
                  <div className="relative h-28 w-28 rounded-full border-2 border-dashed border-zinc-700 bg-zinc-900 flex items-center justify-center overflow-hidden">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt={t('onboarding.avatarPreview')} className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-8 w-8 text-zinc-600" />
                    )}
                  </div>
                  <label className="cursor-pointer rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600 transition">
                    {avatarPreview ? t('onboarding.changePhoto') : t('onboarding.uploadPhoto')}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                  {avatarPreview && (
                    <button
                      onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      {t('onboarding.removePhoto')}
                    </button>
                  )}
                  <p className="text-[10px] text-zinc-600 text-center">
                    {t('onboarding.photoSkipHint')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="mt-6 flex items-center justify-between pt-4 border-t border-zinc-800">
            <div>
              {step > 1 ? (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('onboarding.back')}
                </button>
              ) : (
                <button
                  onClick={skipOnboarding}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  <X className="h-3 w-3" />
                  {t('onboarding.skip')}
                </button>
              )}
            </div>
            <button
              onClick={nextStep}
              disabled={!canProceed() || saving}
              className={cn(
                'flex items-center gap-1 rounded-md px-4 py-2 text-sm font-semibold transition',
                canProceed() && !saving
                  ? 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              )}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  {t('onboarding.saving')}
                </span>
              ) : step === TOTAL_STEPS ? (
                <>
                  {t('onboarding.finish')}
                  <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  {t('onboarding.next')}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Skip link at bottom */}
        <div className="mt-4 text-center">
          <button
            onClick={skipOnboarding}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition uppercase tracking-wider"
          >
            {t('onboarding.completeLater')}
          </button>
        </div>
      </div>
    </div>
  );
}

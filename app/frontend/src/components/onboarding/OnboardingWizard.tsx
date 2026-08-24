import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, X, Upload, Globe, Lock, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateOnboardingCompletion } from '@/lib/profileCompletion';
import { ONBOARDING_STATUS } from '@/lib/onboarding';
import { isValidImageFile, isHeicFile, validateFileSize, getSafeImageExtension, ACCEPT_IMAGES } from '@/lib/fileUploadUtils';

/* ─── Constants ─── */
const ACCOUNT_TYPES = [
  { value: 'worker', label: 'Profesional Industrial', icon: '🔧' },
  { value: 'company', label: 'Empresa', icon: '🏢' },
] as const;

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

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'Disponible ahora' },
  { value: 'in_2_weeks', label: 'Disponible en 2 semanas' },
  { value: 'in_1_month', label: 'Disponible en 1 mes' },
  { value: 'working', label: 'Actualmente trabajando' },
  { value: 'not_available', label: 'No disponible' },
];

const TOTAL_STEPS = 8;
const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/* ─── localStorage helpers ─── */
function getDraftKey(userId: string) {
  return `pipingbox_onboarding_draft_${userId}`;
}

interface OnboardingDraft {
  accountType: 'worker' | 'company';
  mainRole: string;
  specialties: string[];
  country: string;
  city: string;
  availability: string;
  willingToTravel: boolean;
  willingToRelocate: boolean;
  profileVisibility: 'public' | 'private';
  avatarPreview: string | null;
  step: number;
  updatedAt: string;
}

function saveDraftToLocal(userId: string, draft: OnboardingDraft) {
  try {
    localStorage.setItem(getDraftKey(userId), JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function loadDraftFromLocal(userId: string): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
}

function clearDraftFromLocal(userId: string) {
  try {
    localStorage.removeItem(getDraftKey(userId));
  } catch {
    // ignore
  }
}

/* ─── Parse location "city, country" ─── */
function parseLocation(location: string | null): { city: string; country: string } {
  if (!location) return { city: '', country: '' };
  const parts = location.split(',').map((s) => s.trim());
  if (parts.length >= 2) return { city: parts[0], country: parts.slice(1).join(', ') };
  return { city: '', country: parts[0] };
}

/* ─── Component ─── */
interface OnboardingWizardProps {
  onComplete: (selectedAccountType?: string) => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

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

  // UI state
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs for debounce
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  /* ─── Restore draft on mount ─── */
  useEffect(() => {
    if (!user) return;

    const restoreDraft = async () => {
      // 1. Try to load from Supabase profile first (source of truth)
      try {
        const { data: profileData } = await supabase
          .from(TABLES.profiles)
          .select('account_type, title, skills, location, availability_status, willing_to_travel, willing_to_relocate, cv_visible, profile_visibility, avatar_url, full_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileData) {
          const hasSupabaseData =
            profileData.title ||
            (Array.isArray(profileData.skills) && profileData.skills.length > 0) ||
            profileData.location ||
            (profileData.availability_status && profileData.availability_status !== 'not_specified');

          if (hasSupabaseData) {
            console.log('[Onboarding] Restoring from Supabase profile');
            const loc = parseLocation(profileData.location);

            if (profileData.account_type === 'worker' || profileData.account_type === 'company') {
              setAccountType(profileData.account_type);
            }
            if (profileData.title) setMainRole(profileData.title);
            if (Array.isArray(profileData.skills) && profileData.skills.length > 0) setSpecialties(profileData.skills);
            if (loc.country) setCountry(loc.country);
            if (loc.city) setCity(loc.city);
            if (profileData.availability_status && profileData.availability_status !== 'not_specified') {
              setAvailability(profileData.availability_status);
            }
            if (profileData.willing_to_travel) setWillingToTravel(true);
            if (profileData.willing_to_relocate) setWillingToRelocate(true);
            if (profileData.profile_visibility === 'private') {
              setProfileVisibility('private');
            } else if (profileData.cv_visible === false) {
              setProfileVisibility('private');
            }
            if (profileData.avatar_url) setAvatarPreview(profileData.avatar_url);

            setRestoredFromDraft(true);
            return; // Supabase data is sufficient
          }
        }
      } catch (err) {
        console.warn('[Onboarding] Failed to fetch profile for restore:', err);
      }

      // 2. Fallback: Try localStorage draft
      const localDraft = loadDraftFromLocal(user.id);
      if (localDraft) {
        console.log('[Onboarding] Restoring from localStorage draft');
        setAccountType(localDraft.accountType);
        if (localDraft.mainRole) setMainRole(localDraft.mainRole);
        if (localDraft.specialties.length > 0) setSpecialties(localDraft.specialties);
        if (localDraft.country) setCountry(localDraft.country);
        if (localDraft.city) setCity(localDraft.city);
        if (localDraft.availability) setAvailability(localDraft.availability);
        setWillingToTravel(localDraft.willingToTravel);
        setWillingToRelocate(localDraft.willingToRelocate);
        setProfileVisibility(localDraft.profileVisibility);
        if (localDraft.avatarPreview) setAvatarPreview(localDraft.avatarPreview);
        if (localDraft.step > 1) setStep(localDraft.step);
        setRestoredFromDraft(true);
      }
    };

    restoreDraft();
  }, [user]);

  /* ─── Page unload warning ─── */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  /* ─── Cleanup on unmount ─── */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  /* ─── Build current draft object ─── */
  const buildDraft = useCallback((): OnboardingDraft => ({
    accountType,
    mainRole,
    specialties,
    country,
    city,
    availability,
    willingToTravel,
    willingToRelocate,
    profileVisibility,
    avatarPreview,
    step,
    updatedAt: new Date().toISOString(),
  }), [accountType, mainRole, specialties, country, city, availability, willingToTravel, willingToRelocate, profileVisibility, avatarPreview, step]);

  /* ─── Build Supabase update payload from current state ─── */
  const buildSupabasePayload = useCallback(() => {
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

    const payload: Record<string, unknown> = {
      account_type: accountType,
      role: accountType === 'company' ? 'company' : 'worker',
      title: mainRole || null,
      skills: specialties.length > 0 ? specialties : null,
      location: [city, country].filter(Boolean).join(', ') || null,
      availability_status: availability || 'not_specified',
      willing_to_travel: willingToTravel,
      willing_to_relocate: willingToRelocate,
      cv_visible: profileVisibility === 'public',
      profile_visibility: profileVisibility,
      profile_completion: completion,
      updated_at: new Date().toISOString(),
    };

    return payload;
  }, [accountType, mainRole, specialties, country, city, availability, willingToTravel, willingToRelocate, profileVisibility, avatarPreview, profile?.full_name]);

  /* ─── Debounced autosave to Supabase + localStorage ─── */
  const debouncedAutosave = useCallback(() => {
    if (!user) return;

    setHasUnsavedChanges(true);

    // Always save to localStorage immediately (fast, offline-safe)
    saveDraftToLocal(user.id, buildDraft());

    // Debounce Supabase save
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;

      setSaveStatus('saving');
      try {
        const payload = buildSupabasePayload();
        const { error } = await supabase
          .from(TABLES.profiles)
          .update(payload)
          .eq('user_id', user.id);

        if (!isMountedRef.current) return;

        if (error) {
          console.error('[Onboarding] Autosave error:', error.message);
          setSaveStatus('error');
        } else {
          console.log('[Onboarding] Autosaved to Supabase');
          setSaveStatus('saved');
          setHasUnsavedChanges(false);
          // Reset status after 2s
          setTimeout(() => {
            if (isMountedRef.current) setSaveStatus('idle');
          }, 2000);
        }
      } catch (err) {
        console.error('[Onboarding] Autosave exception:', err);
        if (isMountedRef.current) setSaveStatus('error');
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, buildDraft, buildSupabasePayload]);

  /* ─── Trigger autosave when form data changes ─── */
  useEffect(() => {
    // Skip the initial mount / restore phase
    if (!user || !restoredFromDraft) return;
    debouncedAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountType, mainRole, specialties, country, city, availability, willingToTravel, willingToRelocate, profileVisibility]);

  /* ─── Specialty toggle ─── */
  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  /* ─── Avatar change (independent — failure doesn't reset form) ─── */
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value immediately to allow re-selecting same file on mobile
    if (e.target) e.target.value = '';
    if (!file) return;

    setAvatarUploadError(null);

    // Validate file type (mobile-friendly: includes HEIC/HEIF from iPhone)
    if (!isValidImageFile(file)) {
      setAvatarUploadError('Solo se aceptan imágenes JPG, PNG, WebP o HEIC');
      return;
    }
    // Validate file size
    const sizeError = validateFileSize(file, 5);
    if (sizeError) {
      setAvatarUploadError(sizeError);
      return;
    }

    // Inform about HEIC (preview may not work but upload will succeed)
    if (isHeicFile(file)) {
      // HEIC files can't be previewed via FileReader in most browsers
      // but we still accept and upload them
      setAvatarFile(file);
      setAvatarPreview(null); // Can't preview HEIC in browser
      setAvatarUploadError(null);
      // Save to localStorage without preview
      if (user) {
        const draft = buildDraft();
        draft.avatarPreview = null;
        saveDraftToLocal(user.id, draft);
      }
      return;
    }

    setAvatarFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
      // Save preview to localStorage draft
      if (user) {
        const draft = buildDraft();
        draft.avatarPreview = reader.result as string;
        saveDraftToLocal(user.id, draft);
      }
    };
    reader.onerror = () => {
      setAvatarUploadError('Error al leer el archivo. Intenta de nuevo.');
    };
    reader.readAsDataURL(file);
  };

  /* ─── Upload avatar independently ─── */
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;

    setAvatarUploadError(null);
    try {
      const ext = getSafeImageExtension(avatarFile.name);
      const path = `avatars/${user.id}/profile-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('profile_pictures')
        .upload(path, avatarFile, { upsert: true });

      if (uploadErr) {
        console.error('[Onboarding] Avatar upload error:', uploadErr.message);
        setAvatarUploadError(`Error al subir foto: ${uploadErr.message}. Puedes intentar de nuevo.`);
        return null; // Return null but DON'T throw — form data is safe
      }

      const { data: urlData } = supabase.storage
        .from('profile_pictures')
        .getPublicUrl(path);

      return urlData.publicUrl;
    } catch (err) {
      console.error('[Onboarding] Avatar upload exception:', err);
      setAvatarUploadError('Error de red al subir foto. Puedes intentar de nuevo desde tu perfil.');
      return null; // Form data is safe
    }
  };

  /* ─── Final save and complete ─── */
  const saveAndFinish = async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus('saving');

    try {
      // Upload avatar independently — failure doesn't block completion
      let avatarUrl: string | null = null;
      if (avatarFile) {
        avatarUrl = await uploadAvatar();
        // avatarUrl may be null if upload failed — that's OK
      }

      const payload = buildSupabasePayload();

      // Mark as marketplace-ready when profile visibility is public
      if (profileVisibility === 'public') {
        payload.marketplace_ready = true;
        payload.onboarding_status = ONBOARDING_STATUS.MARKETPLACE_READY;
      } else {
        payload.marketplace_ready = false;
        payload.onboarding_status = ONBOARDING_STATUS.PROFILE_STARTED;
      }

      if (avatarUrl) {
        payload.avatar_url = avatarUrl;
      }

      const { error } = await supabase
        .from(TABLES.profiles)
        .update(payload)
        .eq('user_id', user.id);

      if (error) {
        console.error('[Onboarding] Final save error:', error.message);
        setSaveStatus('error');
        // Don't return — data was already autosaved progressively
        // Still navigate to dashboard
      } else {
        setSaveStatus('saved');
      }

      // Clear localStorage draft on successful completion
      clearDraftFromLocal(user.id);
      setHasUnsavedChanges(false);

      await refreshProfile();
      onComplete(accountType);
    } catch (err) {
      console.error('[Onboarding] Error:', err);
      setSaveStatus('error');
      // Even on error, data was autosaved — allow navigation
      clearDraftFromLocal(user.id);
      setHasUnsavedChanges(false);
      await refreshProfile();
      onComplete(accountType);
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
      // Save current step progress to localStorage with new step
      if (user) {
        const draft = buildDraft();
        draft.step = step + 1;
        saveDraftToLocal(user.id, draft);
      }
      setStep(step + 1);
    } else {
      await saveAndFinish();
    }
  };

  const prevStep = () => {
    if (step > 1) {
      if (user) {
        const draft = buildDraft();
        draft.step = step - 1;
        saveDraftToLocal(user.id, draft);
      }
      setStep(step - 1);
    }
  };

  const skipOnboarding = async () => {
    if (!user) return;

    // Save whatever we have so far before skipping
    try {
      const payload = buildSupabasePayload();
      // Skipped onboarding = profile started but not marketplace ready
      payload.onboarding_status = ONBOARDING_STATUS.PROFILE_STARTED;
      payload.marketplace_ready = false;
      const { error } = await supabase
        .from(TABLES.profiles)
        .update(payload)
        .eq('user_id', user.id);

      // supabase-js resolves with { error } instead of throwing, so the catch below
      // never sees a rejected UPDATE. Log it explicitly: silently swallowing this is
      // exactly how PB-ADMIN-ONBOARDING-SCHEMA-001 stayed invisible in production.
      if (error) {
        console.error('[OnboardingWizard] Skip save failed:', error);
      }
    } catch (err) {
      // Best-effort save
      console.error('[OnboardingWizard] Skip save threw:', err);
    }

    clearDraftFromLocal(user.id);
    setHasUnsavedChanges(false);
    await refreshProfile();
    onComplete();
    navigate('/dashboard', { replace: true });
  };

  /* ─── Save status indicator ─── */
  const renderSaveStatus = () => {
    if (saveStatus === 'idle') return null;

    return (
      <div className="flex items-center gap-1.5 text-[10px] transition-opacity duration-300">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
            <span className="text-zinc-400">Guardando...</span>
          </>
        )}
        {saveStatus === 'saved' && (
          <>
            <Cloud className="h-3 w-3 text-emerald-400" />
            <span className="text-emerald-400">Guardado</span>
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <CloudOff className="h-3 w-3 text-red-400" />
            <span className="text-red-400">Error al guardar</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a] p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-zinc-100 sm:text-2xl">
            Configura tu perfil
          </h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            Completa lo esencial ahora. Podrás añadir CV, certificados y experiencia después.
          </p>
          {restoredFromDraft && step > 1 && (
            <p className="mt-1 text-[10px] text-emerald-400/70">
              ✓ Progreso anterior restaurado
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Paso {step} de {TOTAL_STEPS}
            </span>
            <div className="flex items-center gap-3">
              {renderSaveStatus()}
              <span className="text-[10px] font-semibold text-[#f59e0b]">
                {progress}% completado
              </span>
            </div>
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
                <h2 className="text-sm font-semibold text-zinc-200">¿Qué tipo de cuenta necesitas?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {ACCOUNT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setAccountType(t.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-4 transition',
                        accountType === t.value
                          ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                      )}
                    >
                      <span className="text-2xl">{t.icon}</span>
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Main Role */}
            {step === 2 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-200">¿Cuál es tu rol principal?</h2>
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
                <h2 className="text-sm font-semibold text-zinc-200">Selecciona tus especialidades</h2>
                <p className="text-[10px] text-zinc-500">Puedes seleccionar varias</p>
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
                <h2 className="text-sm font-semibold text-zinc-200">¿Dónde te encuentras?</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">País</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Ej: México, España, Colombia..."
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Ciudad / Región</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej: Ciudad de México, Madrid..."
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Availability */}
            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">¿Cuál es tu disponibilidad?</h2>
                <div className="space-y-2">
                  {AVAILABILITY_OPTIONS.map((opt) => (
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
                <h2 className="text-sm font-semibold text-zinc-200">Movilidad y disponibilidad para viajar</h2>
                <p className="text-xs text-zinc-500">Indica si estás dispuesto a viajar o reubicarte por trabajo</p>
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer rounded-md border border-zinc-700 bg-zinc-900 p-4 transition hover:border-zinc-600">
                    <input
                      type="checkbox"
                      checked={willingToTravel}
                      onChange={(e) => setWillingToTravel(e.target.checked)}
                      className="h-5 w-5 rounded border-zinc-600 bg-zinc-800 text-[#f59e0b] focus:ring-[#f59e0b]"
                    />
                    <div>
                      <span className="text-sm font-medium text-zinc-200">Dispuesto a viajar</span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Puedo desplazarme a otras ciudades/países por proyectos</p>
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
                      <span className="text-sm font-medium text-zinc-200">Dispuesto a reubicarse</span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Puedo mudarme de forma permanente por una oportunidad</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Step 7: Profile Visibility */}
            {step === 7 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">Visibilidad de tu perfil</h2>
                <p className="text-xs text-zinc-500">Controla quién puede ver tu perfil en búsquedas</p>
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
                        Perfil público
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Las empresas pueden encontrar tu perfil en búsquedas y contactarte directamente
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
                        Perfil privado
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Solo tú puedes ver tu perfil. Las empresas no te encontrarán en búsquedas
                      </p>
                    </div>
                    {profileVisibility === 'private' && (
                      <Check className="h-4 w-4 text-[#f59e0b] shrink-0 ml-auto mt-0.5" />
                    )}
                  </button>
                </div>
                <div className="rounded-md bg-zinc-900/50 border border-zinc-800 p-3 mt-2">
                  <p className="text-[10px] text-zinc-500">
                    💡 <strong className="text-zinc-400">Recomendado:</strong> Perfil público para recibir ofertas de trabajo. Puedes cambiar esto en cualquier momento desde tu perfil.
                  </p>
                </div>
              </div>
            )}

            {/* Step 8: Photo */}
            {step === 8 && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-200">Foto de perfil (opcional)</h2>
                <p className="text-xs text-zinc-500">Una foto profesional aumenta tu visibilidad</p>
                <div className="flex flex-col items-center gap-4 pt-2">
                  <div className="relative h-28 w-28 rounded-full border-2 border-dashed border-zinc-700 bg-zinc-900 flex items-center justify-center overflow-hidden">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-8 w-8 text-zinc-600" />
                    )}
                  </div>
                  <label className="cursor-pointer rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600 transition active:bg-zinc-800">
                    {avatarFile && !avatarPreview ? '📷 Foto HEIC seleccionada' : avatarPreview ? 'Cambiar foto' : 'Subir foto'}
                    <input
                      type="file"
                      accept={ACCEPT_IMAGES}
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                  {(avatarPreview || avatarFile) && (
                    <button
                      onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Quitar foto
                    </button>
                  )}
                  {avatarUploadError && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400 text-center max-w-xs">
                      {avatarUploadError}
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-600 text-center">
                    Puedes omitir este paso y subir tu foto después
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
                  Atrás
                </button>
              ) : (
                <button
                  onClick={skipOnboarding}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  <X className="h-3 w-3" />
                  Omitir
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
                  Guardando...
                </span>
              ) : step === TOTAL_STEPS ? (
                <>
                  Finalizar
                  <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  Siguiente
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
            Completar después →
          </button>
        </div>
      </div>
    </div>
  );
}
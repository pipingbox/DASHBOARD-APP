import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { FileDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { AvatarUpload } from '@/components/AvatarUpload';
import { CertExpiryBadge } from '@/components/certifications/CertExpiryBadge';
import { CertExpiryWarnings } from '@/components/certifications/CertExpiryWarnings';
import { WorkExperienceSection } from '@/components/profile/WorkExperienceSection';
import { CertificationsSection } from '@/components/profile/CertificationsSection';
import { CVUploadSection } from '@/components/profile/CVUploadSection';
import { DocumentsSection } from '@/components/profile/DocumentsSection';
import { AvailabilityMobilitySection } from '@/components/profile/AvailabilityMobilitySection';
import { AICVExtraction } from '@/components/profile/AICVExtraction';
import { MatchReadyBanner } from '@/components/profile/MatchReadyBanner';
import { ProfileMatchingPreferencesSection } from '@/components/profile/ProfileMatchingPreferencesSection';
import { PhoneVerificationSection } from '@/components/profile/PhoneVerificationSection';
import { notifyProfileSuggestions } from '@/lib/notifications';
import { ProfileCompleteness } from '@/components/profile/ProfileCompleteness';
import { generateCV } from '@/lib/generateCV';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';
import type { Certification } from '@/lib/certifications';

/**
 * Profile page — strict DB-as-source-of-truth approach.
 *
 * Flow:
 * 1. On mount / when `profile` from auth context changes → populate form from DB row.
 * 2. User edits fields locally (local state only for typing UX).
 * 3. On "Guardar perfil" click → send ONLY edited fields to Supabase → refetch → render from refetched row.
 * 4. Profile completion is calculated from the refetched DB row, never from local state.
 * 5. No autosave — explicit save only to avoid race conditions.
 * 6. Avatar and CV are saved by their own components (AvatarUpload, CVUploadSection) which call refreshProfile().
 */

export default function Profile() {
  const { t } = useTranslation();
  const { profile, user, refreshProfile } = useAuth();

  // Form fields — populated from DB profile
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [years, setYears] = useState<string>(''); // string to avoid 0 default
  const [skills, setSkills] = useState('');
  const [bio, setBio] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ─── Sync form from DB profile (source of truth) ───
  useEffect(() => {
    if (!profile) return;

    console.log('[Profile] Syncing form from DB profile:', {
      full_name: profile.full_name,
      title: profile.title,
      company: profile.company,
      location: profile.location,
      years_experience: profile.years_experience,
      skills: profile.skills,
      bio: profile.bio,
      avatar_url: profile.avatar_url ? '(set)' : '(null)',
      cv_file_url: profile.cv_file_url ? '(set)' : '(null)',
    });

    setFullName(profile.full_name ?? '');
    setTitle(profile.title ?? '');
    setCompany(profile.company ?? '');
    setLocation(profile.location ?? '');
    // years_experience: show empty string if null/undefined/0-that-was-default
    const yExp = profile.years_experience;
    setYears(yExp !== null && yExp !== undefined && yExp !== 0 ? String(yExp) : '');
    setSkills(Array.isArray(profile.skills) ? profile.skills.join(', ') : '');
    setBio(profile.bio ?? '');
  }, [profile]);

  // ─── Build save payload — only non-empty edited values ───
  const buildSavePayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // full_name: send trimmed value or null (never empty string)
    const trimmedName = fullName.trim();
    if (trimmedName) payload.full_name = trimmedName;
    else payload.full_name = null;

    // title
    const trimmedTitle = title.trim();
    if (trimmedTitle) payload.title = trimmedTitle;
    else payload.title = null;

    // company
    const trimmedCompany = company.trim();
    if (trimmedCompany) payload.company = trimmedCompany;
    else payload.company = null;

    // location
    const trimmedLocation = location.trim();
    if (trimmedLocation) payload.location = trimmedLocation;
    else payload.location = null;

    // years_experience: null if empty, otherwise number
    if (years.trim() === '') {
      payload.years_experience = null;
    } else {
      const parsed = parseInt(years.trim(), 10);
      payload.years_experience = isNaN(parsed) ? null : parsed;
    }

    // skills: array of non-empty strings
    const skillsArr = skills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    payload.skills = skillsArr.length > 0 ? skillsArr : null;

    // bio
    const trimmedBio = bio.trim();
    if (trimmedBio) payload.bio = trimmedBio;
    else payload.bio = null;

    return payload;
  }, [fullName, title, company, location, years, skills, bio]);

  // ─── Explicit save (button click) ───
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaveStatus('saving');

    const payload = buildSavePayload();

    console.log('[Profile] Save payload:', { userId: user.id, payload });

    const { data: upsertedData, error } = await supabase
      .from(TABLES.profiles)
      .upsert({ ...payload, user_id: user.id }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('[Profile] Save FAILED:', error.message, error.details, error.hint);
      setSaving(false);
      setSaveStatus('error');
      toast.error(t('profile.saveError', 'Error saving profile: ') + error.message);
      // Reset error status after 4s
      setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 4000);
      return;
    }

    if (!upsertedData) {
      console.error('[Profile] Save returned no data — row may not have been written');
      setSaving(false);
      setSaveStatus('error');
      toast.error(t('profile.saveError', 'Error saving profile: ') + 'No data returned from database');
      setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 4000);
      return;
    }

    // Save succeeded — now refetch from DB and update auth context
    console.log('[Profile] Save OK, row confirmed:', upsertedData.user_id);
    await refreshProfile();

    // After refreshProfile, the useEffect above will re-sync form from the new profile
    // This guarantees UI shows exactly what DB has

    // Recalculate profile completion (non-blocking)
    if (user) recalculateAndSaveProfileCompletion(user.id).catch(() => {});

    // Send targeted improvement suggestions for any remaining gaps (PB-NOTIF-001 Fase 3).
    // Fire-and-forget with 30-day dedup per field so the user is never spammed.
    if (user) {
      const savedPayload = payload as Record<string, unknown>;
      notifyProfileSuggestions(user.id, {
        title: savedPayload.title as string | null,
        skills: savedPayload.skills as string[] | null,
        location: savedPayload.location as string | null,
        languages: savedPayload.languages as string[] | null,
        years_experience: savedPayload.years_experience as number | null,
        availability_status: savedPayload.availability_status as string | null,
      }).catch(() => {});
    }

    if (isMountedRef.current) {
      setSaving(false);
      setSaveStatus('saved');
      toast.success(t('profile.profileUpdated'));
      setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 2500);
    }
  };

  // ─── Generate CV ───
  const handleGenerateCV = async () => {
    if (!user || !profile) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.certifications)
        .select('*')
        .eq('user_id', user.id)
        .order('issue_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      await generateCV({
        profile: {
          ...profile,
          full_name: fullName || profile.full_name,
          title: title || profile.title,
          company: company || profile.company,
          location: location || profile.location,
          years_experience: years.trim() !== '' ? parseInt(years.trim(), 10) : profile.years_experience,
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
          bio: bio || profile.bio,
        },
        certifications: (data as Certification[]) ?? [],
      });
      toast.success(t('profile.cvGenerated'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('profile.cvFailed');
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Avatar handlers (AvatarUpload saves to DB + calls refreshProfile) ───
  const handleAvatarChange = useCallback((_url: string | null) => {
    // AvatarUpload already saved to DB and called refreshProfile.
    // The useEffect will re-sync form from the updated profile.
  }, []);

  const handleToggleShow = useCallback((_next: boolean) => {
    // AvatarUpload already saved to DB and called refreshProfile.
  }, []);

  // Derived display values from profile (DB source of truth for preview)
  const avatarUrl = profile?.avatar_url ?? null;
  const showAvatar = profile?.show_avatar ?? true;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <PageHeader
          eyebrow={t('profile.eyebrow')}
          title={t('profile.title')}
          description={t('profile.description')}
        />
        <CertExpiryBadge />
      </div>

      {/* Save status indicator */}
      {saveStatus !== 'idle' && (
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border ${
          saveStatus === 'saving' ? 'border-zinc-700 bg-zinc-900 text-zinc-400' :
          saveStatus === 'saved' ? 'border-emerald-800 bg-emerald-950 text-emerald-400' :
          'border-red-800 bg-red-950 text-red-400'
        }`}>
          {saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
          {saveStatus === 'saved' && <CheckCircle2 className="h-3 w-3" />}
          {saveStatus === 'error' && <AlertCircle className="h-3 w-3" />}
          <span>
            {saveStatus === 'saving' && t('common.saving', 'Saving...')}
            {saveStatus === 'saved' && t('common.saved', 'Saved')}
            {saveStatus === 'error' && t('common.saveError', 'Save error')}
          </span>
        </div>
      )}

      <CertExpiryWarnings />

      <MatchReadyBanner />

      {/* Basic Professional Info */}
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2 border border-zinc-800/80 bg-[#0d0d0d] p-6">
          <AvatarUpload
            avatarUrl={avatarUrl}
            fullName={fullName}
            showAvatar={showAvatar}
            onChange={handleAvatarChange}
            onToggleShow={handleToggleShow}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('common.fullName')}
              </Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.jobTitle')}
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('profile.jobTitlePlaceholder')}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.companyField')}
              </Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.location')}
              </Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('profile.locationPlaceholder')}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.yearsExperience')}
              </Label>
              <Input
                type="number"
                min={0}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                placeholder="e.g. 5"
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              {t('profile.skills')}
            </Label>
            <Input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder={t('profile.skillsPlaceholder')}
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              {t('profile.bio')}
            </Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              placeholder={t('profile.bioPlaceholder')}
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b]"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {saving ? t('common.saving') : t('profile.saveProfile')}
            </Button>
            <Button
              type="button"
              onClick={handleGenerateCV}
              disabled={generating}
              variant="outline"
              className="border-zinc-700 !bg-transparent !hover:bg-transparent text-zinc-200 hover:text-[#f59e0b] hover:border-[#f59e0b]"
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              {generating ? t('profile.generatingCV') : t('profile.generateCV')}
            </Button>
          </div>
        </div>

        <aside className="space-y-6 h-fit">
          <div className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              {t('profile.preview')}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden border border-zinc-800 bg-zinc-900">
                {avatarUrl && showAvatar ? (
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                    {(fullName || 'U')
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">
                  {fullName || t('profile.yourName')}
                </h3>
                <p className="truncate text-xs text-zinc-400">
                  {title || t('profile.yourRole')}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-xs text-zinc-500">
              {company && <p>{company}</p>}
              {location && <p>{location}</p>}
              {years.trim() !== '' && parseInt(years.trim(), 10) > 0 && (
                <p>{t('profile.yearsExperienceShort', { count: parseInt(years.trim(), 10) })}</p>
              )}
            </div>
            {skills && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {skills
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 12)
                  .map((s) => (
                    <span
                      key={s}
                      className="border border-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-400"
                    >
                      {s}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Profile Completeness — calculated from DB data via profile context */}
          <ProfileCompleteness />
        </aside>
      </form>

      {/* Availability & Mobility — has its own save/load from DB */}
      <AvailabilityMobilitySection />

      {/* Matching Preferences + Phone Verification */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileMatchingPreferencesSection />
        <PhoneVerificationSection />
      </div>

      {/* CV Upload — saves directly to DB + calls refreshProfile */}
      <CVUploadSection />

      {/* Work Experience */}
      <WorkExperienceSection />

      {/* Certifications */}
      <CertificationsSection />

      {/* AI CV Extraction */}
      <AICVExtraction />

      {/* Professional Documents */}
      <DocumentsSection />
    </div>
  );
}
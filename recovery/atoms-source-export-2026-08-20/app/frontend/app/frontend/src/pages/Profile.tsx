import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import { FileDown, Loader2 } from 'lucide-react';
import { AvatarUpload } from '@/components/AvatarUpload';
import { CertExpiryBadge } from '@/components/certifications/CertExpiryBadge';
import { CertExpiryWarnings } from '@/components/certifications/CertExpiryWarnings';
import { WorkExperienceSection } from '@/components/profile/WorkExperienceSection';
import { CertificationsSection } from '@/components/profile/CertificationsSection';
import { CVUploadSection } from '@/components/profile/CVUploadSection';
import { DocumentsSection } from '@/components/profile/DocumentsSection';
import { AvailabilityMobilitySection } from '@/components/profile/AvailabilityMobilitySection';
import { AICVExtraction } from '@/components/profile/AICVExtraction';
import { ProfileCompleteness } from '@/components/profile/ProfileCompleteness';
import { generateCV } from '@/lib/generateCV';
import { useAutoCV } from '@/hooks/useAutoCV';
import type { Certification } from '@/lib/certifications';

export default function Profile() {
  const { t } = useTranslation();
  const { profile, user, refreshProfile } = useAuth();
  const { isStale } = useAutoCV(); // AUTO-003: CV staleness detection
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [years, setYears] = useState<number>(0);
  const [skills, setSkills] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showAvatar, setShowAvatar] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setTitle(profile.title ?? '');
    setCompany(profile.company ?? '');
    setLocation(profile.location ?? '');
    setYears(profile.years_experience ?? 0);
    setSkills((profile.skills ?? []).join(', '));
    setBio(profile.bio ?? '');
    setAvatarUrl(profile.avatar_url ?? null);
    setShowAvatar(profile.show_avatar ?? true);
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from(TABLES.profiles)
      .update({
        full_name: fullName,
        title,
        company,
        location,
        years_experience: Number(years) || 0,
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        bio,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('profile.profileUpdated'));
    await refreshProfile();
  };

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
      // TD-09: normalize unified table columns to Certification interface
      const normalizedCerts = ((data as Record<string, unknown>[]) ?? []).map((row) => ({
        ...row,
        name: row.certification_name ?? row.name ?? '',
        issuer: row.issuing_organization ?? row.issuer ?? '',
        file_url: row.certificate_file_url ?? row.file_url ?? null,
        expiry_date: row.expiration_date ?? row.expiry_date ?? null,
      })) as Certification[];
      await generateCV({
        profile: {
          ...profile,
          full_name: fullName || profile.full_name,
          title: title || profile.title,
          company: company || profile.company,
          location: location || profile.location,
          years_experience: Number(years) || profile.years_experience,
          skills: skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          bio: bio || profile.bio,
        },
        certifications: normalizedCerts,
      });
      toast.success(t('profile.cvGenerated'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('profile.cvFailed');
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

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

      <CertExpiryWarnings />

      {/* Basic Professional Info */}
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2 border border-zinc-800/80 bg-[#0d0d0d] p-6">
          <AvatarUpload
            avatarUrl={avatarUrl}
            fullName={fullName}
            showAvatar={showAvatar}
            onChange={(url) => setAvatarUrl(url)}
            onToggleShow={(next) => setShowAvatar(next)}
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
                onChange={(e) => setYears(Number(e.target.value))}
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
              <p>{t('profile.yearsExperienceShort', { count: years || 0 })}</p>
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

          {/* Profile Completeness Indicator */}
          <ProfileCompleteness />
        </aside>
      </form>

      {/* Availability & Mobility */}
      <AvailabilityMobilitySection />

      {/* CV Upload */}
      <CVUploadSection />

      {/* Work Experience */}
      <WorkExperienceSection />

      {/* Certifications (with built-in Alert Preferences) */}
      <CertificationsSection />

      {/* AI CV Extraction */}
      <AICVExtraction />

      {/* Professional Documents */}
      <DocumentsSection />
    </div>
  );
}
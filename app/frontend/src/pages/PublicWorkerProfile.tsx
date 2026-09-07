import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, TABLES } from '@/lib/supabase';
import {
  MapPin,
  Briefcase,
  Wrench,
  ArrowLeft,
  ShieldCheck,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

// UX-003: Public worker profile page.
// Route: /worker/:id — visible to anyone (SEO + shareable).
// Only shows fields marked as public (cv_visible = true, profile_visibility = 'public').
// No sensitive data (email, phone, documents) is exposed.
//
// PB-LEGACY-CERT-QUERIES-001:
//   - `languages` is NOT a column of the profiles table; requesting it made every
//     request fail with PostgREST 42703 (undefined_column) -> the page rendered
//     "Profile not found" for every visitor. Removed from the projection.
//   - work experience is read from the canonical TABLES.workerExperiences key
//     (TABLES.workExperience does not exist -> from(undefined)) and projects
//     `company_name`; the table has no `company` column, so the old projection would
//     have failed with 42703 as well.
//   - certification metadata is intentionally NOT fetched nor rendered here.
//     `is_visible` defaults to true historically and therefore cannot be treated as
//     explicit public consent. Public certification visibility semantics are owned by
//     PB-PUBLIC-CREDENTIAL-VISIBILITY-001. Until that ticket defines opt-in rules this
//     surface stays fail-closed.

interface PublicProfile {
  full_name: string | null;
  title: string | null;
  location: string | null;
  bio: string | null;
  years_experience: number | null;
  skills: string[] | null;
  avatar_url: string | null;
  availability_status: string | null;
  profile_completion: number | null;
}

interface WorkExperience {
  id: string;
  company_name: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export default function PublicWorkerProfile() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [experienceFailed, setExperienceFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setLoadFailed(false);
      setExperienceFailed(false);
      try {
        // Fetch profile — only public profiles
        const { data: profileData, error: profileErr } = await supabase
          .from(TABLES.profiles)
          .select('full_name, title, location, bio, years_experience, skills, avatar_url, availability_status, profile_completion, profile_visibility, cv_visible')
          .eq('user_id', id)
          .maybeSingle();

        // A query failure is NOT the same as "profile does not exist".
        if (profileErr) {
          setLoadFailed(true);
          return;
        }

        if (!profileData) {
          setNotFound(true);
          return;
        }

        const p = profileData as PublicProfile & { profile_visibility?: string; cv_visible?: boolean };

        // Check visibility — only show if public
        if (p.profile_visibility !== 'public' && !p.cv_visible) {
          setNotFound(true);
          return;
        }

        setProfile(p);

        // Fetch experience (public)
        const { data: expData, error: expErr } = await supabase
          .from(TABLES.workerExperiences)
          .select('id, company_name, position, start_date, end_date, description')
          .eq('user_id', id)
          .order('start_date', { ascending: false });

        if (expErr) {
          // Surface the failure instead of pretending the worker has no experience.
          setExperienceFailed(true);
          setExperience([]);
        } else {
          setExperience((expData || []) as WorkExperience[]);
        }
      } catch {
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#f59e0b]" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-100">
        <AlertTriangle className="h-6 w-6 text-[#f59e0b]" />
        <p className="mt-3 text-sm text-zinc-300" data-testid="public-profile-load-error">
          We could not load this profile right now. Please try again later.
        </p>
        <Link to="/" className="mt-4 text-sm text-[#f59e0b] hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-100">
        <p className="text-sm text-zinc-400" data-testid="public-profile-not-found">Profile not found or not public.</p>
        <Link to="/" className="mt-4 text-sm text-[#f59e0b] hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  const skills = profile.skills || [];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-1 text-lg font-bold">
            Piping<span className="text-[#f59e0b]">Box</span>
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-[#f59e0b] px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-[#d97706]"
          >
            {t('landing.signUpFree', { defaultValue: 'Sign up free' })}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6" data-testid="public-worker-profile">
        {/* Back link */}
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>

        {/* Profile header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-[#f59e0b]/30 bg-zinc-900">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name || 'Worker'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-zinc-600">
                {(profile.full_name || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + title */}
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-bold">{profile.full_name || 'Industrial Professional'}</h1>
            {profile.title && (
              <p className="text-sm text-[#f59e0b]">{profile.title}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {profile.location}
                </span>
              )}
              {profile.years_experience != null && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> {profile.years_experience} years exp.
                </span>
              )}
              {profile.availability_status && (
                <span className={`flex items-center gap-1 ${profile.availability_status === 'available' ? 'text-emerald-400' : ''}`}>
                  <ShieldCheck className="h-3 w-3" />
                  {profile.availability_status === 'available' ? 'Available' : profile.availability_status === 'in_2_weeks' ? 'Available in 2 weeks' : 'Not available'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">About</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-300">{profile.bio}</p>
          </section>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <Wrench className="h-3 w-3" /> Skills
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span key={skill} className="rounded-sm border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300">
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {experienceFailed && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Work Experience</h2>
            <p
              className="mt-3 flex items-center gap-2 border border-zinc-800/80 bg-[#0d0d0d] px-4 py-3 text-xs text-zinc-400 rounded-sm"
              data-testid="public-profile-experience-error"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-[#f59e0b]" />
              Work experience could not be loaded.
            </p>
          </section>
        )}

        {!experienceFailed && experience.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Work Experience</h2>
            <div className="mt-3 space-y-4 border-l border-zinc-800 pl-4" data-testid="public-profile-experience-list">
              {experience.map((exp) => (
                <div key={exp.id} className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-200">{exp.position || '—'}</p>
                  <p className="text-xs text-[#f59e0b]">{exp.company_name || '—'}</p>
                  <p className="text-[10px] text-zinc-500">
                    {exp.start_date ? new Date(exp.start_date).toLocaleDateString() : '—'} →{' '}
                    {exp.end_date ? new Date(exp.end_date).toLocaleDateString() : 'Present'}
                  </p>
                  {exp.description && (
                    <p className="text-xs text-zinc-400">{exp.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-12 border-t border-zinc-800 pt-6 text-center">
          <p className="text-sm text-zinc-400">Are you an industrial professional?</p>
          <Link
            to="/register"
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#f59e0b] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[#d97706]"
          >
            Create your free profile
          </Link>
        </div>
      </main>
    </div>
  );
}

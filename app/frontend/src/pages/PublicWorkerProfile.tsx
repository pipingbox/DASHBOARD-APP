import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, TABLES } from '@/lib/supabase';
import {
  MapPin,
  Briefcase,
  Wrench,
  Globe,
  ArrowLeft,
  ShieldCheck,
  Loader2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// UX-003: Public worker profile page.
// Route: /worker/:id — visible to anyone (SEO + shareable).
// Only shows fields marked as public (cv_visible = true, profile_visibility = 'public').
// No sensitive data (email, phone, documents) is exposed.

interface PublicProfile {
  full_name: string | null;
  title: string | null;
  location: string | null;
  bio: string | null;
  years_experience: number | null;
  skills: string[] | null;
  languages: string[] | null;
  avatar_url: string | null;
  availability_status: string | null;
  profile_completion: number | null;
}

interface WorkExperience {
  id: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface WorkerCert {
  certification_id: string;
  issue_date: string | null;
  expiry_date: string | null;
  certifications: { name: string; code: string } | null;
}

export default function PublicWorkerProfile() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [certs, setCerts] = useState<WorkerCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch profile — only public profiles
        const { data: profileData, error: profileErr } = await supabase
          .from(TABLES.profiles)
          .select('full_name, title, location, bio, years_experience, skills, languages, avatar_url, availability_status, profile_completion, profile_visibility, cv_visible')
          .eq('user_id', id)
          .maybeSingle();

        if (profileErr || !profileData) {
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
        const { data: expData } = await supabase
          .from(TABLES.workExperience)
          .select('id, company, position, start_date, end_date, description')
          .eq('user_id', id)
          .order('start_date', { ascending: false });

        setExperience((expData || []) as WorkExperience[]);

        // Fetch certifications (public)
        const { data: certData } = await supabase
          .from(TABLES.workerCertifications)
          .select('certification_id, issue_date, expiry_date, certifications(name, code)')
          .eq('worker_user_id', id);

        setCerts((certData || []) as WorkerCert[]);
      } catch {
        setNotFound(true);
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

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-100">
        <p className="text-sm text-zinc-400">Profile not found or not public.</p>
        <Link to="/" className="mt-4 text-sm text-[#f59e0b] hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  const skills = profile.skills || [];
  const languages = profile.languages || [];

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

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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

        {/* Certifications */}
        {certs.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <ShieldCheck className="h-3 w-3" /> Certifications
            </h2>
            <div className="mt-2 space-y-2">
              {certs.map((c) => (
                <div key={c.certification_id} className="flex items-center justify-between border border-zinc-800/80 bg-[#0d0d0d] px-4 py-2.5 rounded-sm">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {c.certifications?.name || 'Certification'}
                    </p>
                    <p className="text-[10px] text-zinc-500">{c.certifications?.code}</p>
                  </div>
                  <div className="text-right text-[10px] text-zinc-500">
                    {c.issue_date && <p>Issued: {new Date(c.issue_date).toLocaleDateString()}</p>}
                    {c.expiry_date && <p>Expires: {new Date(c.expiry_date).toLocaleDateString()}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Work Experience</h2>
            <div className="mt-3 space-y-4 border-l border-zinc-800 pl-4">
              {experience.map((exp) => (
                <div key={exp.id} className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-200">{exp.position || '—'}</p>
                  <p className="text-xs text-[#f59e0b]">{exp.company || '—'}</p>
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

        {/* Languages */}
        {languages.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <Globe className="h-3 w-3" /> Languages
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {languages.map((lang) => (
                <span key={lang} className="text-xs text-zinc-400">{lang}</span>
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

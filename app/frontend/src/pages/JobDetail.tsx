import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  Languages,
  MapPin,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Job, JobTranslation } from '@/lib/jobs/types';
import {
  getJobTranslation,
  formatPostedTime,
  getContractTypeLabel,
  optionLabelKey,
} from '@/lib/jobs/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN_JOB_TYPES = ['full-time', 'contract', 'freelance'];

/**
 * Public job detail page (PB-JOBS-PILOT-FOLLOWUP-002).
 * - Renders the reader-locale translation when one exists and is fresh;
 *   the original source content otherwise (never a stale translation).
 * - Shows a provenance label ONLY when translated content is displayed.
 * - Offers access to the original text ("View original in …").
 * - Handles anon/authenticated apply with duplicate protection, and fires the
 *   recruitment email notification without ever blocking the application.
 */
export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = i18n.language;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const validId = !!id && UUID_RE.test(id);

  useEffect(() => {
    let mounted = true;
    setNotFound(false);
    if (!validId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    (async () => {
      setLoading(true);
      // RLS: anon/authenticated read open jobs; owners/admin read their own.
      const { data, error } = await supabase
        .from(TABLES.jobs)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        console.warn('JobDetail fetch:', error.message);
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      let jobRow = data as Job;

      // Localized content (public read mirrors the job's open boundary).
      const { data: trs } = await supabase
        .from(TABLES.jobTranslations)
        .select('*')
        .eq('job_id', id);
      if (trs) jobRow = { ...jobRow, translations: trs as JobTranslation[] };
      setJob(jobRow);

      // Duplicate-protection state.
      if (user) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          const { data: apps } = await supabase
            .from(TABLES.jobApplications)
            .select('job_title, company_name')
            .eq('user_id', uid)
            .eq('job_title', jobRow.title)
            .eq('company_name', jobRow.company);
          if (apps && apps.length > 0) setApplied(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [validId, id, user]);

  const resolved = useMemo(() => (job ? getJobTranslation(job, locale) : null), [job, locale]);
  const translated = !!resolved && !resolved.isStale;
  const displayTitle = translated ? resolved!.translation.title : job?.title ?? '';
  const displayDescription = translated
    ? resolved!.translation.description ?? job?.description ?? null
    : job?.description ?? null;
  const displayRequirements = translated
    ? resolved!.translation.requirements ?? job?.requirements ?? null
    : job?.requirements ?? null;
  const postedTime = job ? formatPostedTime(job.created_at) : null;

  const apply = async () => {
    if (!job) return;
    if (!user) {
      toast.info(t('jobs.signInToApply'));
      return;
    }
    if (applied) {
      toast.info(t('jobs.alreadyApplied'));
      return;
    }
    setApplying(true);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      setApplying(false);
      toast.error(t('jobs.mustBeLoggedIn'));
      return;
    }

    // Applications are keyed on the ORIGINAL title/company (unique constraint)
    // so translations can never fragment the duplicate-protection boundary.
    const applicationPayload: Record<string, unknown> = {
      user_id: authData.user.id,
      job_title: job.title,
      company_name: job.company,
      location: job.location ?? null,
      contract_type: job.job_type ?? null,
      status: 'applied',
      job_id: job.id,
    };
    if (job.company_user_id) applicationPayload.company_user_id = job.company_user_id;

    const { error } = await supabase.from(TABLES.jobApplications).insert(applicationPayload);
    setApplying(false);

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        toast.info(t('jobs.alreadyApplied'));
        setApplied(true);
      } else {
        toast.error(t('jobs.applicationFailed'), { description: error.message });
      }
      return;
    }

    // Recruitment notification (jobs@pipingbox.com). Loud on failure, never
    // blocks the application — same contract as the lead alert flow.
    const { data: mailData, error: mailErr } = await supabase.functions.invoke(
      'app_14da0f1941_send_job_application_notification',
      { body: { job_id: job.id } },
    );
    if (mailErr || (mailData && mailData.emailsSent === false)) {
      console.error(
        '[JobDetail] APPLICATION EMAIL NOT SENT — application stored, notification lost:',
        mailErr?.message ?? mailData?.reason ?? 'unknown',
      );
    }

    toast.success(t('jobs.applicationSubmitted'));
    setApplied(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-zinc-800 rounded-sm animate-pulse" />
        <div className="border border-zinc-800/60 bg-[#0d0d0d] p-6 rounded-sm space-y-4 animate-pulse">
          <div className="h-6 w-2/3 bg-zinc-800 rounded-sm" />
          <div className="h-4 w-1/2 bg-zinc-800/50 rounded-sm" />
          <div className="h-24 w-full bg-zinc-800/40 rounded-sm" />
        </div>
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t('jobs.eyebrow')}
          title={t('jobs.jobNotFound')}
          description={t('jobs.jobNotFoundDescription')}
        />
        <Button asChild variant="outline" className="border-zinc-700 text-zinc-300 !bg-transparent">
          <Link to="/jobs">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {t('jobs.backToJobs')}
          </Link>
        </Button>
      </div>
    );
  }

  const jobTypeLabel = KNOWN_JOB_TYPES.includes(job.job_type)
    ? t(optionLabelKey('contractTypes', getContractTypeLabel(job.job_type)))
    : job.job_type;

  const conditions: { label: string; value: string }[] = [];
  if (job.salary_period === 'hour' && job.salary_min) {
    conditions.push({
      label: t('jobs.salaryLabel'),
      value: t('jobs.salaryFromHourly', {
        amount: `${job.currency ?? '€'}${job.salary_min.toLocaleString()}`,
      }),
    });
  }
  if (job.vacancies) {
    conditions.push({ label: t('jobs.vacanciesLabel'), value: t('jobs.vacancies', { count: job.vacancies }) });
  }
  if (job.contract_type) {
    conditions.push({ label: t('jobs.contractLabel'), value: job.contract_type });
  }
  if (job.period) {
    conditions.push({ label: t('jobs.period'), value: job.period });
  }
  if (job.hours_per_day) {
    conditions.push({ label: t('jobs.workingDay'), value: t('jobs.hoursPerDay', { hours: job.hours_per_day }) });
  }
  if (job.schedule) {
    conditions.push({ label: t('jobs.schedule'), value: job.schedule });
  }
  if (job.saturdays === 'optional') {
    conditions.push({ label: t('jobs.saturdays'), value: t('jobs.saturdaysOptional') });
  }
  if (job.saturdays === 'mandatory') {
    conditions.push({ label: t('jobs.saturdays'), value: t('jobs.saturdaysMandatory') });
  }
  if (job.vca_required) {
    conditions.push({ label: 'VCA', value: t('jobs.vcaMandatory') });
  }
  conditions.push({
    label: t('jobs.accommodation'),
    value: job.accommodation_included ? t('jobs.included') : t('jobs.notIncluded'),
  });
  conditions.push({
    label: t('jobs.transport'),
    value: job.transport_included ? t('jobs.included') : t('jobs.notIncluded'),
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('jobs.backToJobs')}
        </Link>
      </div>

      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm">
        {/* Header */}
        <div className="p-5 md:p-8 space-y-3 border-b border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-2">
            {job.category && (
              <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-zinc-700 text-zinc-500 rounded-sm">
                {job.category}
              </span>
            )}
            {job.is_remote && (
              <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-emerald-400/30 text-emerald-400 rounded-sm">
                {t('jobs.remote')}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              <Clock className="h-3 w-3" />
              {t('jobs.posted')}
              {postedTime ? ` ${t(`jobs.postedTimes.${postedTime.key}`, { count: postedTime.count })}` : ''}
            </span>
          </div>

          <h1 className="text-xl md:text-2xl font-semibold text-zinc-100">{displayTitle}</h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {job.company}
            </span>
            {(job.country ?? job.location) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {job.country ?? job.location}
              </span>
            )}
            <span className="uppercase tracking-[0.15em]">{jobTypeLabel}</span>
          </div>

          {translated && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Languages className="h-3 w-3" />
              {t('jobs.translatedFrom', {
                language: t(`languageNames.${job.source_language ?? 'en'}`),
              })}
            </p>
          )}
        </div>

        {/* Conditions grid */}
        {conditions.length > 0 && (
          <div className="p-5 md:p-8 border-b border-zinc-800/80">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">{t('jobs.conditions')}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {conditions.map((c) => (
                <div key={c.label} className="flex items-baseline justify-between gap-4 text-sm border-b border-zinc-800/50 pb-2">
                  <dt className="text-zinc-500 shrink-0">{c.label}</dt>
                  <dd className="text-zinc-200 text-right">{c.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Description */}
        {displayDescription && (
          <div className="p-5 md:p-8 border-b border-zinc-800/80">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">{t('jobs.jobDescription')}</h2>
            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
              {displayDescription}
            </p>
          </div>
        )}

        {/* Requirements */}
        {displayRequirements && (
          <div className="p-5 md:p-8 border-b border-zinc-800/80">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">{t('jobs.candidateProfile')}</h2>
            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
              {displayRequirements}
            </p>
          </div>
        )}

        {/* Original content access */}
        {translated && (
          <details className="p-5 md:p-8 border-b border-zinc-800/80">
            <summary className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors">
              {t('jobs.viewOriginal', {
                language: t(`languageNames.${job.source_language ?? 'en'}`),
              })}
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-zinc-300">{job.title}</p>
              {job.description && (
                <p className="text-sm text-zinc-500 leading-relaxed whitespace-pre-line">
                  {job.description}
                </p>
              )}
            </div>
          </details>
        )}

        {/* Apply */}
        <div className="p-5 md:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-zinc-600">{t('jobs.applyHint')}</p>
          <Button
            onClick={apply}
            disabled={applied || applying}
            className={`font-semibold ${
              applied
                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-800'
                : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
            }`}
          >
            {applied
              ? t('jobs.applied')
              : applying
                ? t('jobs.applying')
                : t('jobs.applyNow')}
            {!applied && !applying && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

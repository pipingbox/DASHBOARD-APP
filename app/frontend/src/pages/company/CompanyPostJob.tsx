import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { MATCHING_NOTIFICATIONS_ENABLED } from '@/lib/featureFlags';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Briefcase,
  ArrowLeft,
  MapPin,
  Wrench,
  FileText,
  DollarSign,
  Send,
  Clock,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Admin job editor (PB-JOBS-PILOT-003 §1–§5).
 *
 * One canonical form for create AND edit (`/company/post-job?edit=<id>`).
 * Writes BOTH the legacy columns (salary_range, rotation, applications_count)
 * and the structured fields the pilot jobs rely on, so public rendering and
 * the translation pipeline keep working for every row.
 *
 * After every save the translation pipeline is triggered fire-and-forget
 * (loud on failure, never blocks the save): the edge function recomputes the
 * source hash and only regenerates stale/missing translations.
 */

const SOURCE_LANGUAGES = ['en', 'es', 'nl', 'fr', 'pt', 'de', 'it', 'pl', 'ro', 'uk', 'bg'];

interface JobForm {
  title: string;
  company_name: string;
  location: string;
  country: string;
  discipline: string;
  contract_type: string;
  vacancies: string;
  salary_mode: '' | 'from' | 'fixed' | 'range';
  salary_period: '' | 'hour' | 'day' | 'month' | 'year';
  salary_min: string;
  salary_max: string;
  currency: string;
  hours_per_day: string;
  schedule: string;
  saturdays: '' | 'optional' | 'mandatory';
  period: string;
  vca_required: boolean;
  accommodation_included: '' | 'yes' | 'no';
  transport_included: '' | 'yes' | 'no';
  source_language: string;
  summary: string;
  description: string;
  requirements: string;
  rotation: string;
  status: 'draft' | 'open' | 'closed';
}

const EMPTY_FORM: JobForm = {
  title: '',
  company_name: '',
  location: '',
  country: '',
  discipline: '',
  contract_type: '',
  vacancies: '',
  salary_mode: '',
  salary_period: '',
  salary_min: '',
  salary_max: '',
  currency: 'EUR',
  hours_per_day: '',
  schedule: '',
  saturdays: '',
  period: '',
  vca_required: false,
  accommodation_included: '',
  transport_included: '',
  source_language: 'en',
  summary: '',
  description: '',
  requirements: '',
  rotation: '',
  status: 'open',
};

export default function CompanyPostJob() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [form, setForm] = useState<JobForm>({
    ...EMPTY_FORM,
    company_name: profile?.full_name || profile?.company || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [loadingJob, setLoadingJob] = useState(!!editId);

  // Edit mode: load the existing job (RLS scopes to owner/primary admin).
  useEffect(() => {
    if (!editId || !user) return;
    let mounted = true;
    (async () => {
      setLoadingJob(true);
      const { data, error } = await supabase
        .from(TABLES.jobs)
        .select('*')
        .eq('id', editId)
        .maybeSingle();
      if (!mounted) return;
      if (error || !data) {
        toast.error(t('companyPostJob.loadFailed', { error: error?.message ?? 'not found' }));
        setLoadingJob(false);
        return;
      }
      const j = data as Record<string, unknown>;
      setForm({
        title: (j.title as string) ?? '',
        company_name: (j.company_name as string) ?? (j.company as string) ?? '',
        location: (j.location as string) ?? '',
        country: (j.country as string) ?? '',
        discipline: (j.discipline as string) ?? (j.category as string) ?? '',
        contract_type: (j.contract_type as string) ?? '',
        vacancies: j.vacancies != null ? String(j.vacancies) : '',
        salary_mode: (j.salary_mode as JobForm['salary_mode']) ?? '',
        salary_period: (j.salary_period as JobForm['salary_period']) ?? '',
        salary_min: j.salary_min != null ? String(j.salary_min) : '',
        salary_max: j.salary_max != null ? String(j.salary_max) : '',
        currency: (j.currency as string) ?? 'EUR',
        hours_per_day: j.hours_per_day != null ? String(j.hours_per_day) : '',
        schedule: (j.schedule as string) ?? '',
        saturdays: (j.saturdays as JobForm['saturdays']) ?? '',
        period: (j.period as string) ?? '',
        vca_required: j.vca_required === true,
        accommodation_included:
          j.accommodation_included == null ? '' : j.accommodation_included ? 'yes' : 'no',
        transport_included:
          j.transport_included == null ? '' : j.transport_included ? 'yes' : 'no',
        source_language: (j.source_language as string) ?? 'en',
        summary: (j.summary as string) ?? '',
        description: (j.description as string) ?? '',
        requirements: (j.requirements as string) ?? '',
        rotation: (j.rotation as string) ?? '',
        status: (['draft', 'open', 'closed'].includes(j.status as string)
          ? j.status
          : 'open') as JobForm['status'],
      });
      setLoadingJob(false);
    })();
    return () => {
      mounted = false;
    };
  }, [editId, user, t]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const buildPayload = (companyName: string, authUserId: string, status: JobForm['status']) => {
    const salaryMin = form.salary_min ? Number(form.salary_min) : null;
    const salaryMax = form.salary_max ? Number(form.salary_max) : null;
    const salaryRange =
      salaryMin != null || salaryMax != null
        ? `${salaryMin ?? '?'}–${salaryMax ?? '?'}`
        : null;

    const payload: Record<string, unknown> = {
      // Legacy columns (public rendering / duplicate-protection compatibility).
      company: companyName || 'Unknown',
      company_name: companyName || null,
      title: form.title,
      location: form.location,
      country: form.country || null,
      discipline: form.discipline,
      contract_type: form.contract_type || null,
      salary_range: salaryRange,
      rotation: form.rotation || null,
      description: form.description || null,
      requirements: form.requirements || null,
      status,
      // Structured fields (PB-JOBS-PILOT-003 §2–§5).
      vacancies: form.vacancies ? Number(form.vacancies) : null,
      salary_mode: form.salary_mode || null,
      salary_period: form.salary_period || null,
      salary_min: salaryMin,
      salary_max: salaryMax,
      currency: form.currency || 'EUR',
      hours_per_day: form.hours_per_day ? Number(form.hours_per_day) : null,
      schedule: form.schedule || null,
      saturdays: form.saturdays || null,
      period: form.period || null,
      vca_required: form.vca_required,
      accommodation_included:
        form.accommodation_included === '' ? null : form.accommodation_included === 'yes',
      transport_included:
        form.transport_included === '' ? null : form.transport_included === 'yes',
      source_language: form.source_language || 'en',
      summary: form.summary || null,
    };
    if (!editId) {
      payload.posted_by = authUserId;
      payload.company_user_id = authUserId;
      payload.applications_count = 0;
    }
    return payload;
  };

  const save = async (status: JobForm['status']) => {
    if (!form.title || !form.location || !form.discipline) {
      toast.error(t('companyPostJob.fillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        toast.error(t('companyPostJob.mustBeLoggedIn'));
        setSubmitting(false);
        return;
      }

      let companyName = form.company_name;
      if (!companyName && profile?.company) companyName = profile.company;
      if (!companyName) {
        const { data: profileData } = await supabase
          .from(TABLES.profiles)
          .select('company, full_name')
          .eq('user_id', authUser.id)
          .maybeSingle();
        companyName =
          profileData?.company || profileData?.full_name || authUser.email?.split('@')[0] || 'Unknown';
      }

      const payload = buildPayload(companyName, authUser.id, status);

      let jobId = editId;
      if (editId) {
        const { error } = await supabase.from(TABLES.jobs).update(payload).eq('id', editId);
        if (error) {
          toast.error(t('companyPostJob.updateFailed', { error: error.message }));
          setSubmitting(false);
          return;
        }
      } else {
        const { data: jobRow, error } = await supabase
          .from(TABLES.jobs)
          .insert(payload)
          .select('id')
          .single();
        if (error) {
          toast.error(t('companyPostJob.publishFailed', { error: error.message }));
          setSubmitting(false);
          return;
        }
        jobId = jobRow?.id ?? null;
      }

      // Automatic translation pipeline (PB-JOBS-PILOT-003 §6): the edge
      // function recomputes the source hash and (re)generates only stale or
      // missing translations. Fail-open: translation trouble never blocks
      // the save — the job stays usable in its source language (§9).
      if (jobId) {
        supabase.functions
          .invoke('app_14da0f1941_translate_job', { body: { job_id: jobId } })
          .then(({ data, error }) => {
            if (error) {
              console.error('[CompanyPostJob] translate_job failed (job saved):', error.message);
            } else if (data && data.translated === 0 && data.skipped === 0 && data.failed > 0) {
              console.error('[CompanyPostJob] translate_job: all targets failed (job saved)');
            }
          })
          .catch((err) => console.error('[CompanyPostJob] translate_job invoke error:', err));
      }

      // Job-match notify (existing flag-guarded behaviour, create only).
      if (!editId && jobId && status === 'open' && MATCHING_NOTIFICATIONS_ENABLED) {
        supabase.functions
          .invoke('job-match-notify', { body: { job_id: jobId } })
          .catch((err) => console.warn('[CompanyPostJob] job-match-notify failed:', err));
      }

      toast.success(
        editId
          ? t('companyPostJob.updateSuccess')
          : status === 'draft'
            ? t('companyPostJob.draftSaved')
            : t('companyPostJob.publishSuccess'),
      );
      navigate('/company/jobs');
    } catch (err: any) {
      console.error('Unexpected error during job save:', err);
      toast.error(t('common.unexpectedError'));
    } finally {
      setSubmitting(false);
    }
  };

  const pageTitle = editId ? t('companyPostJob.editTitle') : t('companyPostJob.title');
  const pageDescription = editId
    ? t('companyPostJob.editDescription')
    : t('companyPostJob.description');

  if (loadingJob) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('companyPostJob.eyebrow')}
        title={pageTitle}
        description={pageDescription}
        actions={
          <Link
            to="/company/jobs"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('companyPostJob.backToJobs')}
          </Link>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(editId ? form.status : 'open');
        }}
        className="max-w-3xl space-y-6"
      >
        {/* Basic Info */}
        <Section title={t('companyPostJob.basicInfo')} icon={Briefcase}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('companyPostJob.jobTitle')} name="title" value={form.title} onChange={handleChange} placeholder={t('companyPostJob.jobTitlePlaceholder')} />
            <Field label={t('companyPostJob.companyName')} name="company_name" value={form.company_name} onChange={handleChange} placeholder={t('companyPostJob.companyNamePlaceholder')} />
            <Field label={t('companyPostJob.vacancies')} name="vacancies" value={form.vacancies} onChange={handleChange} placeholder={t('companyPostJob.vacanciesPlaceholder')} type="number" />
            <SelectField
              label={t('companyPostJob.sourceLanguage')}
              name="source_language"
              value={form.source_language}
              onChange={handleChange}
              options={SOURCE_LANGUAGES.map((code) => ({
                value: code,
                label: t(`languageNames.${code}`),
              }))}
            />
          </div>
        </Section>

        {/* Location */}
        <Section title={t('companyPostJob.locationRegion')} icon={MapPin}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('companyPostJob.location')} name="location" value={form.location} onChange={handleChange} placeholder={t('companyPostJob.locationPlaceholder')} />
            <Field label={t('companyPostJob.country')} name="country" value={form.country} onChange={handleChange} placeholder={t('companyPostJob.countryPlaceholder')} />
          </div>
        </Section>

        {/* Job Details */}
        <Section title={t('companyPostJob.jobDetails')} icon={Wrench}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('companyPostJob.discipline')} name="discipline" value={form.discipline} onChange={handleChange} placeholder={t('companyPostJob.disciplinePlaceholder')} />
            <SelectField
              label={t('companyPostJob.contractType')}
              name="contract_type"
              value={form.contract_type}
              onChange={handleChange}
              options={[
                { value: '', label: t('companyPostJob.selectOption') },
                { value: t('companyPostJob.permanent'), label: t('companyPostJob.permanent') },
                { value: t('companyPostJob.contract'), label: t('companyPostJob.contract') },
                { value: t('companyPostJob.temporary'), label: t('companyPostJob.temporary') },
                { value: t('companyPostJob.freelance'), label: t('companyPostJob.freelance') },
              ]}
            />
          </div>
        </Section>

        {/* Compensation — explicit structured salary metadata (§2). */}
        <Section title={t('companyPostJob.compensation')} icon={DollarSign}>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label={t('companyPostJob.salaryMode')}
              name="salary_mode"
              value={form.salary_mode}
              onChange={handleChange}
              options={[
                { value: '', label: t('companyPostJob.selectOption') },
                { value: 'from', label: t('companyPostJob.salaryModeFrom') },
                { value: 'fixed', label: t('companyPostJob.salaryModeFixed') },
                { value: 'range', label: t('companyPostJob.salaryModeRange') },
              ]}
            />
            <SelectField
              label={t('companyPostJob.salaryPeriod')}
              name="salary_period"
              value={form.salary_period}
              onChange={handleChange}
              options={[
                { value: '', label: t('companyPostJob.selectOption') },
                { value: 'hour', label: t('companyPostJob.periodHour') },
                { value: 'day', label: t('companyPostJob.periodDay') },
                { value: 'month', label: t('companyPostJob.periodMonth') },
                { value: 'year', label: t('companyPostJob.periodYear') },
              ]}
            />
            <Field label={t('companyPostJob.currency')} name="currency" value={form.currency} onChange={handleChange} placeholder={t('companyPostJob.currencyPlaceholder')} />
            <Field label={t('companyPostJob.salaryMin')} name="salary_min" value={form.salary_min} onChange={handleChange} placeholder={t('companyPostJob.salaryMinPlaceholder')} type="number" />
            <Field label={t('companyPostJob.salaryMax')} name="salary_max" value={form.salary_max} onChange={handleChange} placeholder={t('companyPostJob.salaryMaxPlaceholder')} type="number" />
            <Field label={t('companyPostJob.rotation')} name="rotation" value={form.rotation} onChange={handleChange} placeholder={t('companyPostJob.rotationPlaceholder')} />
          </div>
        </Section>

        {/* Working Conditions (§3). */}
        <Section title={t('companyPostJob.workingConditions')} icon={Clock}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('companyPostJob.hoursPerDay')} name="hours_per_day" value={form.hours_per_day} onChange={handleChange} placeholder={t('companyPostJob.hoursPerDayPlaceholder')} type="number" />
            <Field label={t('companyPostJob.schedule')} name="schedule" value={form.schedule} onChange={handleChange} placeholder={t('companyPostJob.schedulePlaceholder')} />
            <SelectField
              label={t('companyPostJob.saturdays')}
              name="saturdays"
              value={form.saturdays}
              onChange={handleChange}
              options={[
                { value: '', label: t('companyPostJob.saturdaysNone') },
                { value: 'optional', label: t('companyPostJob.saturdaysOptional') },
                { value: 'mandatory', label: t('companyPostJob.saturdaysMandatory') },
              ]}
            />
            <Field label={t('companyPostJob.projectPeriod')} name="period" value={form.period} onChange={handleChange} placeholder={t('companyPostJob.projectPeriodPlaceholder')} />
            <SelectField
              label={t('companyPostJob.accommodation')}
              name="accommodation_included"
              value={form.accommodation_included}
              onChange={handleChange}
              options={[
                { value: '', label: t('companyPostJob.selectOption') },
                { value: 'yes', label: t('jobs.included') },
                { value: 'no', label: t('jobs.notIncluded') },
              ]}
            />
            <SelectField
              label={t('companyPostJob.transport')}
              name="transport_included"
              value={form.transport_included}
              onChange={handleChange}
              options={[
                { value: '', label: t('companyPostJob.selectOption') },
                { value: 'yes', label: t('jobs.included') },
                { value: 'no', label: t('jobs.notIncluded') },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              name="vca_required"
              checked={form.vca_required}
              onChange={handleChange}
              className="h-4 w-4 rounded-sm border-zinc-700 bg-zinc-950 accent-[#f59e0b]"
            />
            {t('companyPostJob.vcaRequired')}
          </label>
        </Section>

        {/* Content (§4). */}
        <Section title={t('companyPostJob.descriptionRequirements')} icon={FileText}>
          <TextArea label={t('companyPostJob.summary')} name="summary" value={form.summary} onChange={handleChange} placeholder={t('companyPostJob.summaryPlaceholder')} rows={2} />
          <TextArea label={t('companyPostJob.jobDescription')} name="description" value={form.description} onChange={handleChange} placeholder={t('companyPostJob.jobDescPlaceholder')} rows={5} />
          <TextArea label={t('companyPostJob.requirements')} name="requirements" value={form.requirements} onChange={handleChange} placeholder={t('companyPostJob.requirementsPlaceholder')} rows={4} />
        </Section>

        {/* Status (edit mode) */}
        {editId && (
          <Section title={t('companyPostJob.status')} icon={Settings}>
            <SelectField
              label={t('companyPostJob.status')}
              name="status"
              value={form.status}
              onChange={handleChange}
              options={[
                { value: 'draft', label: t('companyPostJob.statusDraft') },
                { value: 'open', label: t('companyPostJob.statusOpen') },
                { value: 'closed', label: t('companyPostJob.statusClosed') },
              ]}
            />
          </Section>
        )}

        {/* Submit */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-800/80">
          {editId ? (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#d97706] transition disabled:opacity-50"
            >
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('companyPostJob.saveChanges')}
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#d97706] transition disabled:opacity-50"
              >
                {submitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t('companyPostJob.publishJob')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void save('draft')}
                className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 transition disabled:opacity-50"
              >
                {t('companyPostJob.saveDraft')}
              </button>
            </>
          )}
          <Link
            to="/company/jobs"
            className="px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}

/* ─── Helpers ─── */
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#f59e0b]" />
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, type = 'text' }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition"
      />
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f59e0b]/50 transition"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextArea({ label, name, value, onChange, placeholder, rows = 4 }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder: string; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition resize-y"
      />
    </div>
  );
}

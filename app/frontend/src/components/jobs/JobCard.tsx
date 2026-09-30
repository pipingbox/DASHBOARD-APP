import {
  Building2,
  MapPin,
  Clock,
  ArrowRight,
  Languages,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Job } from '@/lib/jobs/types';
import {
  formatSalary,
  formatPostedTime,
  getContractTypeLabel,
  optionLabelKey,
  getJobTranslation,
  jobDisplayTitle,
  jobDisplaySummary,
  currencySymbol,
  structuredSalaryLabel,
} from '@/lib/jobs/utils';

interface JobCardProps {
  job: Job;
  applied: boolean;
  applying: boolean;
  onApply: (job: Job) => void;
}

const KNOWN_JOB_TYPES = ['full-time', 'contract', 'freelance'];

/**
 * Compact listing card (PB-JOBS-PILOT-FOLLOWUP-002 §14–§15).
 * Shows a concise, localized summary — the full description lives on the
 * job detail page (/jobs/:id). Legacy rows without the structured fields
 * keep rendering their legacy values.
 */
export function JobCard({ job, applied, applying, onApply }: JobCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const resolved = getJobTranslation(job, locale);
  const translated = !!resolved && !resolved.isStale;
  const displayTitle = jobDisplayTitle(job, locale);
  const displaySummary = jobDisplaySummary(job, locale);
  const postedTime = formatPostedTime(job.created_at);
  const jobTypeLabel = KNOWN_JOB_TYPES.includes(job.job_type)
    ? t(optionLabelKey('contractTypes', getContractTypeLabel(job.job_type)))
    : job.job_type;

  // Location label: city/site first (PB-JOBS-UMICORE-MECHANIC-001 — the
  // visible location must show the city, e.g. "Antwerpen, Belgium"), falling
  // back to the structured country column. Country filtering still uses
  // `country` (Jobs.tsx getCountry), so normalization is preserved.
  const countryRaw = job.location ?? job.country ?? null;
  const countryLabel = countryRaw
    ? OPTION_COUNTRY_KEYS[countryRaw]
      ? t(OPTION_COUNTRY_KEYS[countryRaw])
      : countryRaw
    : null;

  // Salary precedence (PB-JOBS-PILOT-003 §2): explicit structured metadata
  // (salary_mode + salary_period) → legacy hourly wording → legacy heuristic.
  const structuredSalary = structuredSalaryLabel(job, t);
  const hourlySalary =
    !structuredSalary && job.salary_period === 'hour' && job.salary_min
      ? t('jobs.salaryFromHourly', {
          amount: `${currencySymbol(job.currency)}${job.salary_min.toLocaleString()}`,
        })
      : null;
  const legacySalary =
    structuredSalary || hourlySalary
      ? null
      : (() => {
          const salary = formatSalary(job);
          return salary
            ? t(salary.period === 'year' ? 'jobs.salaryPerYear' : 'jobs.salaryPerMonth', { amount: salary.amount })
            : null;
        })();
  const salaryLabel = structuredSalary ?? hourlySalary ?? legacySalary;

  const badges: string[] = [];
  if (job.vca_required) badges.push(t('jobs.vcaRequired'));
  if (job.hours_per_day) badges.push(t('jobs.hoursPerDay', { hours: job.hours_per_day }));
  if (job.saturdays === 'optional') badges.push(t('jobs.saturdaysOptionalShort'));
  if (job.saturdays === 'mandatory') badges.push(t('jobs.saturdaysMandatoryShort'));

  return (
    <div className="group relative border border-zinc-800/80 bg-[#0d0d0d] p-4 md:p-5 rounded-sm hover:border-[#f59e0b]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5">
      <div className="absolute inset-0 bg-gradient-to-r from-[#f59e0b]/[0.01] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300">
            <Link to={`/jobs/${job.id}`}>{displayTitle}</Link>
          </h3>
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
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {job.company}
          </span>
          {countryLabel && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {countryLabel}
            </span>
          )}
          {job.contract_type ? (
            <span>{job.contract_type}</span>
          ) : (
            <span className="uppercase tracking-[0.15em]">{jobTypeLabel}</span>
          )}
        </div>

        {salaryLabel && (
          <p className="text-sm font-medium text-[#f59e0b]">{salaryLabel}</p>
        )}

        {displaySummary && (
          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{displaySummary}</p>
        )}

        {badges.length > 0 && (
          <p className="text-xs text-zinc-400">{badges.join(' · ')}</p>
        )}

        {job.vacancies ? (
          <p className="text-xs text-zinc-300">
            {t('jobs.vacancies', { count: job.vacancies })}
          </p>
        ) : null}

        {translated && (
          <p className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Languages className="h-3 w-3" />
            {t('jobs.translatedFrom', {
              language: t(`languageNames.${job.source_language ?? 'en'}`),
            })}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Clock className="h-3 w-3" />
            {t('jobs.posted')}
            {postedTime ? ` ${t(`jobs.postedTimes.${postedTime.key}`, { count: postedTime.count })}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 !bg-transparent"
            >
              <Link to={`/jobs/${job.id}`}>{t('jobs.viewJob')}</Link>
            </Button>
            <Button
              onClick={() => onApply(job)}
              disabled={applied || applying}
              className={`relative shrink-0 font-semibold ${
                applied
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
              }`}
            >
              {applied
                ? t('jobs.applied')
                : applying
                  ? t('jobs.applying')
                  : t('jobs.apply')}
              {!applied && !applying && (
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Country raw value → i18n key (mirrors jobs.options.countries). */
const OPTION_COUNTRY_KEYS: Record<string, string> = {
  'Belgium': 'jobs.options.countries.belgium',
  'Netherlands': 'jobs.options.countries.netherlands',
  'Germany': 'jobs.options.countries.germany',
  'Norway': 'jobs.options.countries.norway',
  'UAE': 'jobs.options.countries.uae',
  'United Kingdom': 'jobs.options.countries.unitedKingdom',
  'USA': 'jobs.options.countries.usa',
};

export function JobSkeleton() {
  return (
    <div className="border border-zinc-800/60 bg-[#0d0d0d] p-6 rounded-sm animate-pulse">
      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-5 w-48 bg-zinc-800 rounded-sm" />
          <div className="h-4 w-16 bg-zinc-800/60 rounded-sm" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-3.5 w-28 bg-zinc-800/50 rounded-sm" />
          <div className="h-3.5 w-24 bg-zinc-800/50 rounded-sm" />
          <div className="h-3.5 w-20 bg-zinc-800/50 rounded-sm" />
        </div>
        <div className="h-4 w-2/3 bg-zinc-800/40 rounded-sm" />
        <div className="h-3.5 w-40 bg-zinc-800/40 rounded-sm" />
      </div>
    </div>
  );
}

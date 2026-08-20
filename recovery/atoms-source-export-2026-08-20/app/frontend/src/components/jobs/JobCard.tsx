import {
  Building2,
  MapPin,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Job } from '@/lib/jobs/types';
import { formatSalary } from '@/lib/jobs/static-data';

interface JobCardProps {
  job: Job;
  applied: boolean;
  applying: boolean;
  onApply: () => void;
}

export function JobCard({ job, applied, applying, onApply }: JobCardProps) {
  const { t } = useTranslation();
  const salary = formatSalary(job);

  // Calculate relative time from created_at
  const postedTime = (() => {
    if (!job.created_at) return '';
    const diff = Date.now() - new Date(job.created_at).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return t('jobs.justNow', 'Just now');
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  })();

  return (
    <div className="group relative flex flex-col gap-4 border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-[#f59e0b]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5 md:flex-row md:items-center md:justify-between">
      <div className="absolute inset-0 bg-gradient-to-r from-[#f59e0b]/[0.01] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300">
            {job.title}
          </h3>
          {job.is_remote && (
            <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-emerald-400/30 text-emerald-400 rounded-sm">
              {t('jobs.remote')}
            </span>
          )}
          {job.category && (
            <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-zinc-700 text-zinc-500 rounded-sm">
              {job.category}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {job.company}
          </span>
          {job.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
          )}
          <span className="uppercase tracking-[0.15em]">{job.job_type}</span>
          {salary && <span className="text-[#f59e0b] font-medium">{salary}</span>}
        </div>

        {job.description && (
          <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed line-clamp-2">
            {job.description}
          </p>
        )}

        {postedTime && (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Clock className="h-3 w-3" />
            {t('jobs.posted')} {postedTime}
          </div>
        )}
      </div>

      <Button
        onClick={onApply}
        disabled={applied || applying}
        className={`relative shrink-0 font-semibold ${
          applied
            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-800'
            : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
        }`}
      >
        {applied ? t('jobs.applied') : applying ? t('jobs.applying') : t('jobs.apply')}
        {!applied && !applying && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
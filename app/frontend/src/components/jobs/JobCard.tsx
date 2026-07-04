import {
  Building2,
  MapPin,
  BadgeCheck,
  AlertTriangle,
  Anchor,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Job } from '@/lib/jobs/types';
import { formatSalary, getStaticIndex } from '@/lib/jobs/static-data';
import { URGENT_INDICES, ROTATIONS, isOffshore, POSTED_TIMES } from '@/data/job-constants';

interface JobCardProps {
  job: Job;
  applied: boolean;
  applying: boolean;
  onApply: (job: Job) => void;
}

export function JobCard({ job, applied, applying, onApply }: JobCardProps) {
  const { t } = useTranslation();
  const salary = formatSalary(job);
  const sIdx = getStaticIndex(job);
  const urgent = URGENT_INDICES.includes(sIdx);
  const offshore = isOffshore(sIdx);
  const rotation = ROTATIONS[sIdx];
  const postedTime = sIdx >= 0 && sIdx < POSTED_TIMES.length ? POSTED_TIMES[sIdx] : '1w ago';

  return (
    <div className="group relative flex flex-col gap-4 border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-[#f59e0b]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5 md:flex-row md:items-center md:justify-between">
      <div className="absolute inset-0 bg-gradient-to-r from-[#f59e0b]/[0.01] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300">
            {job.title}
          </h3>
          {urgent && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm">
              <AlertTriangle className="h-3 w-3" />
              Urgent
            </span>
          )}
          {offshore && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
              <Anchor className="h-3 w-3" />
              Offshore
            </span>
          )}
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
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
            <BadgeCheck className="h-3 w-3" />
            Verified
          </span>
          {job.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
          )}
          {rotation && (
            <span className="text-zinc-600">Rotation: {rotation}</span>
          )}
          <span className="uppercase tracking-[0.15em]">{job.job_type}</span>
          {salary && <span className="text-[#f59e0b] font-medium">{salary}</span>}
        </div>

        {job.description && (
          <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
            {job.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Clock className="h-3 w-3" />
          Posted {postedTime}
        </div>
      </div>

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
  );
}

export function JobSkeleton() {
  return (
    <div className="border border-zinc-800/60 bg-[#0d0d0d] p-6 rounded-sm animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
          <div className="h-4 w-3/4 bg-zinc-800/40 rounded-sm" />
        </div>
        <div className="h-9 w-24 bg-zinc-800 rounded-sm" />
      </div>
    </div>
  );
}
